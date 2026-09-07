/**
 * Monitoring Worker — runs every 5 minutes.
 *
 * Checks:
 *   - Hot wallet balances vs thresholds
 *   - System health (DB, Discord, providers)
 *   - Suspicious activity patterns
 */

import cron from 'node-cron';
import axios from 'axios';
import { db } from '../db/client';
import { logger } from '../utils/logger';
import { config } from '../config/env';
import { sendAdminAlert } from '../notifications/notificationService';
import { runHealthAlerts } from './healthCheck';
import { rpcUrl, blockbookUrl, blockbookHeaders } from '../config/nownodes';
import { Connection, PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';

const log = logger.child({ worker: 'monitoring' });

export function startMonitoringWorker(): void {
  log.info('Monitoring worker starting (every 5 minutes)');

  cron.schedule('*/5 * * * *', () => {
    void runMonitoringChecks().catch((err) =>
      log.error({ err }, 'Monitoring worker error'),
    );
  });
}

async function runMonitoringChecks(): Promise<void> {
  await Promise.all([
    checkHotWalletBalances(),
    runHealthAlerts(),
    checkSuspiciousActivity(),
  ]);
}

// ---------------------------------------------------------------------------
// Hot wallet threshold alerts
// ---------------------------------------------------------------------------

async function checkHotWalletBalances(): Promise<void> {
  const thresholds: Record<string, number> = {
    BTC:      config.MIN_HOT_WALLET_BTC,
    LTC:      config.MIN_HOT_WALLET_LTC,
    ETH:      config.MIN_HOT_WALLET_ETH,
    USDC_SPL: config.MIN_HOT_WALLET_SOL,
  };

  const wallets = [
    { asset: 'BTC',      address: config.HOT_WALLET_BTC,  chain: 'bitcoin'  },
    { asset: 'LTC',      address: config.HOT_WALLET_LTC,  chain: 'litecoin' },
    { asset: 'ETH',      address: config.HOT_WALLET_ETH,  chain: 'ethereum' },
    { asset: 'USDC_SPL', address: config.HOT_WALLET_SOL,  chain: 'solana'   },
  ].filter((w): w is { asset: string; address: string; chain: string } => !!w.address);

  for (const wallet of wallets) {
    try {
      const balance = await fetchWalletBalance(wallet.address, wallet.asset, wallet.chain);
      if (balance === null) continue;

      // Update DB cache
      await db`
        INSERT INTO hot_wallet_balances (asset, chain, address, balance)
        VALUES (${wallet.asset}, ${wallet.chain}, ${wallet.address}, ${balance})
        ON CONFLICT (asset) DO UPDATE
          SET balance = ${balance}, last_checked_at = NOW(), updated_at = NOW()
      `;

      const threshold = thresholds[wallet.asset];
      if (threshold !== undefined && balance < threshold) {
        log.warn({ asset: wallet.asset, balance, threshold }, 'Hot wallet below threshold');
        await sendAdminAlert(
          `🔴 **Low Hot Wallet Balance**\nAsset: \`${wallet.asset}\`\nBalance: \`${balance.toFixed(8)}\`\nThreshold: \`${threshold.toFixed(8)}\`\nAddress: \`${wallet.address}\``,
        );
      }
    } catch (err) {
      log.warn({ err, asset: wallet.asset }, 'Failed to check hot wallet balance');
    }
  }
}

async function fetchWalletBalance(address: string, asset: string, chain: string): Promise<number | null> {
  try {
    if (chain === 'bitcoin' || chain === 'litecoin') {
      const res = await axios.get<{ final_balance?: number }>(
        `${blockbookUrl(chain === 'litecoin' ? 'ltc' : 'btc')}/addr/${address}/balance`,
        { headers: blockbookHeaders(), timeout: 10000 },
      );
      return (res.data.final_balance ?? 0) / 1e8;
    }
    if (chain === 'ethereum' && asset === 'ETH') {
      const provider = new ethers.JsonRpcProvider(rpcUrl('eth'));
      const balance = await provider.getBalance(address);
      return Number(balance) / 1e18;
    }
    if (chain === 'solana') {
      const connection = new Connection(rpcUrl('sol'), 'confirmed');
      const balance = await connection.getBalance(new PublicKey(address));
      return balance / 1e9;
    }
  } catch { /* ignored */ }
  return null;
}

// ---------------------------------------------------------------------------
// Suspicious activity detection
// ---------------------------------------------------------------------------

async function checkSuspiciousActivity(): Promise<void> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Multiple failed claims (could indicate balance manipulation attempts)
  const recentFailed = await db<{ actor_discord_id: string; count: string }[]>`
    SELECT actor_discord_id, COUNT(*)::text AS count
    FROM audit_logs
    WHERE action = 'MANUAL_DEBIT'
      AND created_at > ${fiveMinAgo.toISOString()}
    GROUP BY actor_discord_id
    HAVING COUNT(*) > 5
  `;

  if (recentFailed.length > 0) {
    const users = recentFailed.map(r => `<@${r.actor_discord_id}> (${r.count}x)`).join(', ');
    await sendAdminAlert(`⚠️ **Suspicious Activity** — High rate of MANUAL_DEBIT actions:\n${users}`);
  }

  // Rapid ticket creation (more than 5 trades in 5 min by one user)
  const rapidCreators = await db<{ user_discord_id: string; count: string }[]>`
    SELECT user_discord_id, COUNT(*)::text AS count
    FROM trades
    WHERE created_at > ${fiveMinAgo.toISOString()}
    GROUP BY user_discord_id
    HAVING COUNT(*) > 5
  `;

  if (rapidCreators.length > 0) {
    const users = rapidCreators.map(r => `<@${r.user_discord_id}> (${r.count} trades)`).join(', ');
    await sendAdminAlert(`⚠️ **Suspicious Activity** — Rapid ticket creation:\n${users}`);
  }
}
