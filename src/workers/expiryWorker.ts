/**
 * Trade Expiry & Escalation Worker
 *
 * Runs every minute via cron. Scans all active trades and applies
 * timeout rules defined in config / fee_config table:
 *
 *   OPEN          unclaimed  > TIMEOUT_OPEN_MINUTES          → EXPIRED
 *   FIAT_PENDING  no payment > TIMEOUT_CLAIMED_MINUTES       → CANCELLED + escrow released
 *   FIAT_SENT     no release > TIMEOUT_FIAT_SENT_MINUTES     → escalate admin (1st ping)
 *   DISPUTED      unresolved > TIMEOUT_DISPUTED_HOURS        → second admin escalation
 *   CRYPTO_SENT   no confirm > threshold (handled in txEngine) — alert only here
 *
 * All transitions write trade_logs. Escrow returns on cancellation.
 */

import cron from 'node-cron';
import { db } from '../db/client';
import { logger } from '../utils/logger';
import { config } from '../config/env';
import { transitionTrade } from '../engine/tradeService';
import { releaseEscrow } from '../ledger/ledgerService';
import { escrowReleaseKey } from '../security/idempotency';
import type { DbTrade } from '../types';

const log = logger.child({ worker: 'expiry' });

export function startExpiryWorker(): void {
  log.info('Expiry worker starting (every minute)');

  cron.schedule('* * * * *', () => {
    void runExpiryCheck().catch((err) =>
      log.error({ err }, 'Expiry worker run failed'),
    );
  });
}

// ---------------------------------------------------------------------------
// Main run
// ---------------------------------------------------------------------------

async function runExpiryCheck(): Promise<void> {
  const now = new Date();

  await Promise.all([
    expireOpenTrades(now),
    cancelStaleClaimed(now),
    escalateStaleFiatSent(now),
    escalateStaleDisputed(now),
  ]);
}

// ---------------------------------------------------------------------------
// OPEN → EXPIRED
// ---------------------------------------------------------------------------

async function expireOpenTrades(now: Date): Promise<void> {
  const trades = await db<DbTrade[]>`
    SELECT * FROM trades
    WHERE status = 'OPEN'
      AND expires_at IS NOT NULL
      AND expires_at < ${now.toISOString()}
  `;

  for (const trade of trades) {
    try {
      await transitionTrade({
        tradeId:        trade.id,
        to:             'EXPIRED',
        actorDiscordId: 'SYSTEM',
        note:           `Auto-expired after ${config.TIMEOUT_OPEN_MINUTES} minutes unclaimed`,
      });

      log.info({ tradeId: trade.id }, 'Trade expired (unclaimed)');

      await notifyAsync('notifyTradeExpired', trade.id);
      await archiveChannel(trade);
    } catch (err) {
      log.error({ err, tradeId: trade.id }, 'Failed to expire trade');
    }
  }
}

// ---------------------------------------------------------------------------
// FIAT_PENDING → CANCELLED  (exchanger claimed but user never paid)
// ---------------------------------------------------------------------------

async function cancelStaleClaimed(now: Date): Promise<void> {
  const cutoff = new Date(
    now.getTime() - config.TIMEOUT_CLAIMED_MINUTES * 60 * 1000,
  );

  const trades = await db<DbTrade[]>`
    SELECT * FROM trades
    WHERE status = 'FIAT_PENDING'
      AND claimed_at IS NOT NULL
      AND claimed_at < ${cutoff.toISOString()}
  `;

  for (const trade of trades) {
    try {
      // Release escrow back to exchanger
      if (trade.exchanger_id) {
        await releaseEscrow({
          exchangerId:    trade.exchanger_id,
          tradeId:        trade.id,
          asset:          trade.asset,
          amount:         trade.amount,
          idempotencyKey: escrowReleaseKey(trade.id, 'CANCEL'),
        });
      }

      await transitionTrade({
        tradeId:        trade.id,
        to:             'CANCELLED',
        actorDiscordId: 'SYSTEM',
        note:           `Auto-cancelled: user did not send fiat within ${config.TIMEOUT_CLAIMED_MINUTES} minutes`,
      });

      log.info({ tradeId: trade.id }, 'Trade cancelled (fiat not sent)');

      await notifyAsync('notifyTradeCancelled', trade.id);
      await archiveChannel(trade);
    } catch (err) {
      log.error({ err, tradeId: trade.id }, 'Failed to cancel stale claimed trade');
    }
  }
}

// ---------------------------------------------------------------------------
// FIAT_SENT — escalate if exchanger not releasing
// ---------------------------------------------------------------------------

async function escalateStaleFiatSent(now: Date): Promise<void> {
  const cutoff = new Date(
    now.getTime() - config.TIMEOUT_FIAT_SENT_MINUTES * 60 * 1000,
  );

  const trades = await db<(DbTrade & { escalated_at: Date | null })[`${string}`] extends never
    ? DbTrade[]
    : DbTrade[]>`
    SELECT t.*
    FROM trades t
    WHERE t.status = 'FIAT_SENT'
      AND t.updated_at < ${cutoff.toISOString()}
  ` as DbTrade[];

  for (const trade of trades) {
    try {
      // Check if we already pinged (avoid duplicate escalations)
      const alreadyEscalated = await db<{ id: string }[]>`
        SELECT id FROM trade_logs
        WHERE trade_id = ${trade.id}
          AND note LIKE 'ESCALATION:%'
        LIMIT 1
      `;
      if (alreadyEscalated.length > 0) continue;

      // Write escalation note in trade_logs (no status change)
      await db`
        INSERT INTO trade_logs (trade_id, from_status, to_status, actor_discord_id, note)
        VALUES (${trade.id}, 'FIAT_SENT', 'FIAT_SENT', 'SYSTEM', 'ESCALATION: exchanger not releasing fiat-sent trade')
      `;

      log.warn({ tradeId: trade.id }, 'Escalating stale FIAT_SENT trade to admin');
      await sendAdminEscalation(
        trade,
        `⚠️ **Escalation** — Exchanger has not released crypto on trade \`${trade.id}\` for over ${config.TIMEOUT_FIAT_SENT_MINUTES} minutes.\nUser: <@${trade.user_discord_id}>`,
      );
    } catch (err) {
      log.error({ err, tradeId: trade.id }, 'Failed to escalate FIAT_SENT trade');
    }
  }
}

// ---------------------------------------------------------------------------
// DISPUTED — second escalation after threshold
// ---------------------------------------------------------------------------

async function escalateStaleDisputed(now: Date): Promise<void> {
  const cutoff = new Date(
    now.getTime() - config.TIMEOUT_DISPUTED_HOURS * 60 * 60 * 1000,
  );

  const trades = await db<DbTrade[]>`
    SELECT * FROM trades
    WHERE status = 'DISPUTED'
      AND updated_at < ${cutoff.toISOString()}
  `;

  for (const trade of trades) {
    try {
      const secondEscalation = await db<{ id: string }[]>`
        SELECT id FROM trade_logs
        WHERE trade_id = ${trade.id}
          AND note LIKE 'ESCALATION_2:%'
        LIMIT 1
      `;
      if (secondEscalation.length > 0) continue;

      await db`
        INSERT INTO trade_logs (trade_id, from_status, to_status, actor_discord_id, note)
        VALUES (${trade.id}, 'DISPUTED', 'DISPUTED', 'SYSTEM', 'ESCALATION_2: dispute unresolved beyond threshold')
      `;

      log.warn({ tradeId: trade.id }, 'Second escalation for stale disputed trade');
      await sendAdminEscalation(
        trade,
        `🚨 **Second Escalation** — Trade \`${trade.id}\` has been DISPUTED for over ${config.TIMEOUT_DISPUTED_HOURS} hours with no resolution.\nImmediate admin action required.`,
      );
    } catch (err) {
      log.error({ err, tradeId: trade.id }, 'Failed to escalate disputed trade');
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function archiveChannel(trade: DbTrade): Promise<void> {
  try {
    const { getDiscordClient } = await import('../bot/client');
    const client  = getDiscordClient();
    const channel = client.channels.cache.get(trade.ticket_channel_id);
    if (!channel || !channel.isTextBased()) return;

    // Send a closing message then lock the channel
    await (channel as import('discord.js').TextChannel).send({
      embeds: [
        new (await import('discord.js')).EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('🔒 Ticket Closed')
          .setDescription(`This trade has been ${trade.status === 'EXPIRED' ? 'expired' : 'cancelled'} automatically.`)
          .setTimestamp(),
      ],
    });

    await (channel as import('discord.js').TextChannel).permissionOverwrites.set([
      {
        id: channel.guild.id,
        deny: [(await import('discord.js')).PermissionFlagsBits.SendMessages],
      },
    ]);
  } catch { /* non-fatal — channel may already be deleted */ }
}

async function sendAdminEscalation(trade: DbTrade, message: string): Promise<void> {
  try {
    const { sendAdminAlert } = await import('../notifications/notificationService');
    await sendAdminAlert(`${message}\n\nTicket: <#${trade.ticket_channel_id}>`);
  } catch (err) {
    log.warn({ err }, 'Failed to send admin escalation alert');
  }
}

async function notifyAsync(fnName: string, tradeId: string): Promise<void> {
  try {
    const ns = await import('../notifications/notificationService');
    const fn = ns[fnName as keyof typeof ns] as ((id: string) => Promise<void>) | undefined;
    if (fn) await fn(tradeId);
  } catch (err) {
    log.warn({ err, fnName }, 'Notification failed — non-fatal');
  }
}
