/**
 * Exchanger Service — admin-controlled onboarding and management.
 * All writes produce an audit_log entry.
 */

import { db } from '../db/client';
import { provisionAddresses } from '../wallet/addressService';
import { getAllBalances } from '../ledger/ledgerService';
import { logger } from '../utils/logger';
import type { DbExchanger, DbDepositAddress } from '../types';

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export interface VerifyResult {
  exchanger: DbExchanger;
  addresses: DbDepositAddress[];
  isNew:     boolean;
}

export async function verifyExchanger(params: {
  targetDiscordId: string;
  targetUsername:  string;
  adminDiscordId:  string;
}): Promise<VerifyResult> {
  const { targetDiscordId, targetUsername, adminDiscordId } = params;

  const result = await db.begin(async (sql) => {
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (discord_id, discord_username)
      VALUES (${targetDiscordId}, ${targetUsername})
      ON CONFLICT (discord_id) DO UPDATE SET discord_username = EXCLUDED.discord_username
      RETURNING id
    `;

    const existing = await sql<DbExchanger[]>`
      SELECT * FROM exchangers WHERE discord_id = ${targetDiscordId}
    `;

    let exchanger: DbExchanger;
    let isNew: boolean;

    if (existing.length > 0) {
      const [updated] = await sql<DbExchanger[]>`
        UPDATE exchangers
        SET is_active = TRUE, is_banned = FALSE, ban_reason = NULL,
            verified_by_discord_id = ${adminDiscordId}, verified_at = NOW()
        WHERE discord_id = ${targetDiscordId}
        RETURNING *
      `;
      exchanger = updated;
      isNew = false;
    } else {
      const [created] = await sql<DbExchanger[]>`
        INSERT INTO exchangers (user_id, discord_id, discord_username, verified_by_discord_id)
        VALUES (${user.id}, ${targetDiscordId}, ${targetUsername}, ${adminDiscordId})
        RETURNING *
      `;
      exchanger = created;
      isNew = true;
    }

    await sql`
      INSERT INTO audit_logs (actor_discord_id, target_discord_id, action, entity_type, entity_id, metadata)
      VALUES (
        ${adminDiscordId}, ${targetDiscordId}, 'EXCHANGER_VERIFIED',
        'exchanger', ${exchanger.id},
        ${JSON.stringify({ isNew, username: targetUsername })}::jsonb
      )
    `;

    logger.info({ targetDiscordId, adminDiscordId, isNew }, 'Exchanger verified');
    return { exchanger, isNew };
  });

  // Provision addresses outside the transaction
  const addresses = await provisionAddresses(result.exchanger.id);
  return { ...result, addresses };
}

// ---------------------------------------------------------------------------
// Ban
// ---------------------------------------------------------------------------

export async function banExchanger(params: {
  targetDiscordId: string;
  adminDiscordId:  string;
  reason:          string;
}): Promise<DbExchanger> {
  const { targetDiscordId, adminDiscordId, reason } = params;

  return db.begin(async (sql) => {
    const rows = await sql<DbExchanger[]>`
      UPDATE exchangers
      SET is_banned = TRUE, is_active = FALSE, ban_reason = ${reason}
      WHERE discord_id = ${targetDiscordId}
      RETURNING *
    `;
    if (rows.length === 0) throw new Error(`Exchanger ${targetDiscordId} not found`);

    await sql`
      INSERT INTO audit_logs (actor_discord_id, target_discord_id, action, entity_type, entity_id, metadata)
      VALUES (
        ${adminDiscordId}, ${targetDiscordId}, 'EXCHANGER_BANNED',
        'exchanger', ${rows[0].id},
        ${JSON.stringify({ reason })}::jsonb
      )
    `;

    logger.info({ targetDiscordId, adminDiscordId, reason }, 'Exchanger banned');
    return rows[0];
  });
}

// ---------------------------------------------------------------------------
// Reactivate (un-ban)
// ---------------------------------------------------------------------------

export async function reactivateExchanger(params: {
  exchangerId:    string;
  adminDiscordId: string;
}): Promise<DbExchanger> {
  return db.begin(async (sql) => {
    const rows = await sql<DbExchanger[]>`
      UPDATE exchangers
      SET is_banned = FALSE, is_active = TRUE, ban_reason = NULL
      WHERE id = ${params.exchangerId}
      RETURNING *
    `;
    if (rows.length === 0) throw new Error(`Exchanger ${params.exchangerId} not found`);

    await sql`
      INSERT INTO audit_logs (actor_discord_id, target_discord_id, action, entity_type, entity_id, metadata)
      VALUES (
        ${params.adminDiscordId}, ${rows[0].discord_id}, 'EXCHANGER_VERIFIED',
        'exchanger', ${rows[0].id},
        ${JSON.stringify({ reactivated: true })}::jsonb
      )
    `;

    logger.info({ exchangerId: params.exchangerId, adminDiscordId: params.adminDiscordId }, 'Exchanger reactivated');
    return rows[0];
  });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface TradeStats {
  completedTrades: number;
  disputedTrades:  number;
  cancelledTrades: number;
  totalVolume:     Record<string, string>;
}

export interface ExchangerProfile {
  exchanger: DbExchanger;
  addresses: DbDepositAddress[];
  balances:  Awaited<ReturnType<typeof getAllBalances>>;
  stats:     TradeStats;
}

export async function getExchangerProfile(discordId: string): Promise<ExchangerProfile | null> {
  const rows = await db<DbExchanger[]>`
    SELECT * FROM exchangers WHERE discord_id = ${discordId}
  `;
  if (rows.length === 0) return null;
  const exchanger = rows[0];

  const [addresses, balances, stats] = await Promise.all([
    db<DbDepositAddress[]>`
      SELECT * FROM deposit_addresses WHERE exchanger_id = ${exchanger.id} ORDER BY asset
    `,
    getAllBalances(exchanger.id),
    getTradeStats(exchanger.id),
  ]);

  return { exchanger, addresses, balances, stats };
}

async function getTradeStats(exchangerId: string): Promise<TradeStats> {
  const rows = await db<{ status: string; count: string; asset: string; vol: string }[]>`
    SELECT
      status,
      COUNT(*)::text AS count,
      asset,
      COALESCE(SUM(amount), 0)::text AS vol
    FROM trades
    WHERE exchanger_id = ${exchangerId}
    GROUP BY status, asset
  `;

  let completedTrades = 0;
  let disputedTrades  = 0;
  let cancelledTrades = 0;
  const totalVolume: Record<string, string> = {};

  for (const row of rows) {
    const n = parseInt(row.count, 10);
    if (row.status === 'COMPLETED') {
      completedTrades += n;
      totalVolume[row.asset] = (
        parseFloat(totalVolume[row.asset] ?? '0') + parseFloat(row.vol)
      ).toFixed(8);
    }
    if (row.status === 'DISPUTED')  disputedTrades  += n;
    if (row.status === 'CANCELLED') cancelledTrades += n;
  }

  return { completedTrades, disputedTrades, cancelledTrades, totalVolume };
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export async function getExchangerById(exchangerId: string): Promise<DbExchanger | null> {
  const rows = await db<DbExchanger[]>`SELECT * FROM exchangers WHERE id = ${exchangerId}`;
  return rows[0] ?? null;
}

export async function getExchangerByDiscordId(discordId: string): Promise<DbExchanger | null> {
  const rows = await db<DbExchanger[]>`SELECT * FROM exchangers WHERE discord_id = ${discordId}`;
  return rows[0] ?? null;
}
