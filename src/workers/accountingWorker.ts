/**
 * Accounting & Reconciliation Worker
 *
 * Two jobs:
 *
 * 1. dailyReport (cron: 00:00 UTC) — posts daily summary to admin channel:
 *    total deposits, withdrawals, fees, active escrow, per-asset breakdown.
 *
 * 2. ledgerReconciliation (cron: every 30 min) — compares ledger sums vs
 *    on-chain balance of every deposit address. Flags discrepancies.
 */

import cron from 'node-cron';
import axios from 'axios';
import { db } from '../db/client';
import { logger } from '../utils/logger';
import { config } from '../config/env';
import { sendAdminAlert } from '../notifications/notificationService';
import { EmbedBuilder } from 'discord.js';
import { getDiscordClient } from '../bot/client';
import { COLORS } from '../bot/embeds/colors';
import { getChannelAdminAlerts } from '../config/runtimeConfig';
import { rpcUrl, blockbookUrl, blockbookHeaders } from '../config/nownodes';
import { Connection, PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import type { Asset } from '../types';

const log = logger.child({ worker: 'accounting' });

export function startAccountingWorker(): void {
  log.info('Accounting worker starting');

  // Daily report at midnight UTC
  cron.schedule('0 0 * * *', () => {
    void runDailyReport().catch((err) => log.error({ err }, 'Daily report failed'));
  });

  // Ledger reconciliation every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    void runLedgerReconciliation().catch((err) =>
      log.error({ err }, 'Ledger reconciliation failed'),
    );
  });
}

// ---------------------------------------------------------------------------
// Daily accounting report
// ---------------------------------------------------------------------------

async function runDailyReport(): Promise<void> {
  log.info('Running daily accounting report');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Aggregate ledger entries for the past 24h
  const rows = await db<{
    asset: string;
    type: string;
    total: string;
  }[]>`
    SELECT
      asset,
      type,
      SUM(amount)::text AS total
    FROM ledger_entries
    WHERE created_at >= ${yesterday.toISOString()}
      AND created_at <  ${today.toISOString()}
    GROUP BY asset, type
    ORDER BY asset, type
  `;

  // Active escrow (all time, not just today)
  const escrowRows = await db<{ asset: string; escrow: string }[]>`
    SELECT
      asset,
      SUM(CASE
        WHEN type = 'ESCROW_LOCK'    THEN  amount
        WHEN type IN ('ESCROW_RELEASE', 'WITHDRAWAL') THEN -amount
        ELSE 0
      END)::text AS escrow
    FROM ledger_entries
    GROUP BY asset
  `;

  // Trade counts for the day
  const tradeCounts = await db<{ status: string; count: string }[]>`
    SELECT status, COUNT(*)::text AS count
    FROM trades
    WHERE created_at >= ${yesterday.toISOString()}
    GROUP BY status
  `;

  // Build per-asset summary
  const assetMap: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    if (!assetMap[row.asset]) assetMap[row.asset] = {};
    assetMap[row.asset][row.type] = parseFloat(row.total);
  }

  const assetLines = Object.entries(assetMap).map(([asset, types]) => {
    const dep  = (types['DEPOSIT']       ?? 0).toFixed(8);
    const with_ = (types['WITHDRAWAL']   ?? 0).toFixed(8);
    const fee  = (types['FEE']           ?? 0).toFixed(8);
    const esc  = escrowRows.find(r => r.asset === asset);
    const escrow = esc ? parseFloat(esc.escrow).toFixed(8) : '0.00000000';
    return `**${asset}**\nDeposits: \`${dep}\` | Withdrawals: \`${with_}\` | Fees: \`${fee}\` | Escrow: \`${escrow}\``;
  }).join('\n\n') || '_No activity_';

  const tradeLines = tradeCounts.map(r => `${r.status}: **${r.count}**`).join(' | ') || '_No trades_';

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('📊 RapidEx Daily Accounting Report')
    .setDescription(`**Date:** ${yesterday.toISOString().split('T')[0]}`)
    .addFields(
      { name: '💱 Per-Asset Summary', value: assetLines, inline: false },
      { name: '📋 Trade Activity',    value: tradeLines, inline: false },
    )
    .setTimestamp();

  try {
    const client  = getDiscordClient();
    const channelId = await getChannelAdminAlerts();
    if (!channelId) return;
    const channel = client.channels.cache.get(channelId);
    if (channel?.isTextBased()) {
      await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
    }
  } catch (err) {
    log.error({ err }, 'Failed to post daily report');
  }

  log.info('Daily accounting report posted');
}

// ---------------------------------------------------------------------------
// Ledger reconciliation
// ---------------------------------------------------------------------------

async function runLedgerReconciliation(): Promise<void> {
  log.debug('Running ledger reconciliation');

  const addresses = await db<{
    address: string;
    asset: string;
    chain: string;
    exchanger_id: string;
  }[]>`
    SELECT da.address, da.asset, da.chain, da.exchanger_id
    FROM deposit_addresses da
    JOIN exchangers e ON e.id = da.exchanger_id
    WHERE e.is_active = TRUE AND e.is_banned = FALSE
  `;

  for (const addr of addresses) {
    try {
      await reconcileAddress(addr.address, addr.asset as Asset, addr.chain, addr.exchanger_id);
    } catch (err) {
      log.warn({ err, address: addr.address }, 'Reconciliation check failed');
    }
  }
}

async function reconcileAddress(
  address: string,
  asset: Asset,
  chain: string,
  exchangerId: string,
): Promise<void> {
  const onChain = await getOnChainBalance(address, asset, chain);
  if (onChain === null) return; // couldn't fetch — skip silently

  // Ledger sum for this exchanger + asset
  const rows = await db<{ available: string; escrow: string }[]>`
    SELECT
      COALESCE(SUM(CASE
        WHEN type IN ('DEPOSIT', 'ESCROW_RELEASE', 'MANUAL_CREDIT') THEN  amount
        WHEN type IN ('ESCROW_LOCK', 'WITHDRAWAL', 'FEE', 'MANUAL_DEBIT') THEN -amount
        ELSE 0
      END), 0)::text AS available,
      COALESCE(SUM(CASE
        WHEN type = 'ESCROW_LOCK'    THEN  amount
        WHEN type IN ('ESCROW_RELEASE', 'WITHDRAWAL') THEN -amount
        ELSE 0
      END), 0)::text AS escrow
    FROM ledger_entries
    WHERE exchanger_id = ${exchangerId} AND asset = ${asset}
  `;

  const ledgerTotal = parseFloat(rows[0]?.available ?? '0') + parseFloat(rows[0]?.escrow ?? '0');
  const diff        = Math.abs(onChain - ledgerTotal);
  const threshold   = 0.00001; // Tolerate tiny floating-point differences

  if (diff > threshold) {
    const msg = [
      `🔴 **Ledger Discrepancy Detected**`,
      `Asset: \`${asset}\` | Address: \`${address.slice(0, 20)}...\``,
      `On-chain: \`${onChain.toFixed(8)}\``,
      `Ledger total: \`${ledgerTotal.toFixed(8)}\``,
      `Difference: \`${diff.toFixed(8)}\``,
    ].join('\n');

    log.error({ address, asset, onChain, ledgerTotal, diff }, 'LEDGER DISCREPANCY');
    await sendAdminAlert(msg);

    // Update hot_wallet_balances for monitoring dashboard
    await db`
      INSERT INTO hot_wallet_balances (asset, chain, address, balance)
      VALUES (${asset}, ${chain}, ${address}, ${onChain})
      ON CONFLICT (asset) DO UPDATE
        SET balance = ${onChain}, last_checked_at = NOW(), updated_at = NOW()
    `;
  }
}

async function getOnChainBalance(address: string, asset: Asset, chain: string): Promise<number | null> {
  try {
    if (chain === 'bitcoin' || chain === 'litecoin') {
      const res = await axios.get<{ final_balance?: number }>(
        `${blockbookUrl(chain === 'litecoin' ? 'ltc' : 'btc')}/addr/${address}/balance`,
        { headers: blockbookHeaders(), timeout: 10000 },
      );
      return (res.data.final_balance ?? 0) / 1e8;
    }

    if (chain === 'ethereum') {
      if (asset === 'ETH') {
        const provider = new ethers.JsonRpcProvider(rpcUrl('eth'));
        const balance = await provider.getBalance(address);
        return Number(balance) / 1e18;
      }
      return null;
    }

    if (chain === 'solana') {
      const connection = new Connection(rpcUrl('sol'), 'confirmed');
      const balance = await connection.getBalance(new PublicKey(address));
      return balance / 1e9;
    }

    return null;
  } catch {
    return null;
  }
}
