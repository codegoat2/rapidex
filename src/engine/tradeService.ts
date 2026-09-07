/**
 * Trade Service — core trade lifecycle database operations.
 *
 * All state transitions go through transitionTrade() which:
 *   1. Validates the transition is allowed by the state machine
 *   2. Executes the DB update atomically
 *   3. Writes a trade_log entry
 *
 * Business logic (ledger calls, notifications, TX sends) lives in
 * the handler layer — this service is purely DB + state machine.
 */

import { db } from '../db/client';
import { logger } from '../utils/logger';
import { getSettingNumber } from '../admin/settingsService';
import type { DbTrade, DbTradeLog, TradeStatus, Asset, FiatCurrency, FiatMethod, TradeDirection } from '../types';

// ---------------------------------------------------------------------------
// State machine — allowed transitions
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<TradeStatus, TradeStatus[]> = {
  OPEN:            ['CLAIMED', 'CANCELLED', 'EXPIRED'],
  CLAIMED:         ['FIAT_PENDING', 'CANCELLED'],
  FIAT_PENDING:    ['FIAT_SENT', 'CANCELLED', 'EXPIRED'],
  FIAT_SENT:       ['RELEASE_PENDING', 'DISPUTED'],
  RELEASE_PENDING: ['CRYPTO_SENT', 'DISPUTED'],
  CRYPTO_SENT:     ['COMPLETED', 'FAILED'],
  COMPLETED:       [],
  CANCELLED:       [],
  DISPUTED:        ['COMPLETED', 'CANCELLED'],
  EXPIRED:         [],
  FAILED:          [],
};

export function isTransitionAllowed(from: TradeStatus, to: TradeStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  constructor(from: TradeStatus, to: TradeStatus) {
    super(`Invalid trade transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateTradeParams {
  userDiscordId:   string;
  asset:           Asset;
  amount:          string;
  fiatCurrency:    FiatCurrency;
  fiatMethod:      FiatMethod;
  direction:       TradeDirection;
  ticketChannelId: string;
  quoteId:         string;
  fiatAmount:      string;
  rate:            string;
  rateSource:      string;
  feePercentage:   string;
  feeAmount:       string;
  quoteExpiresAt:  Date;
}

export async function createTrade(params: CreateTradeParams): Promise<DbTrade> {
  const { config } = await import('../config/env');

  const openTimeout = await getSettingNumber('TIMEOUT_OPEN_MINUTES', config.TIMEOUT_OPEN_MINUTES);
  const expiresAt = new Date(Date.now() + openTimeout * 60 * 1000);

  const [trade] = await db<DbTrade[]>`
    INSERT INTO trades (
      user_discord_id, asset, amount, fiat_currency,
      fiat_method, direction, ticket_channel_id, expires_at,
      quote_id, fiat_amount, rate, rate_source,
      fee_percentage_snapshot, fee_amount, quote_expires_at
    ) VALUES (
      ${params.userDiscordId},
      ${params.asset},
      ${params.amount},
      ${params.fiatCurrency},
      ${params.fiatMethod},
      ${params.direction},
      ${params.ticketChannelId},
      ${expiresAt.toISOString()},
      ${params.quoteId},
      ${params.fiatAmount},
      ${params.rate},
      ${params.rateSource},
      ${params.feePercentage},
      ${params.feeAmount},
      ${params.quoteExpiresAt.toISOString()}
    )
    RETURNING *
  `;

  await db`
    INSERT INTO trade_logs (trade_id, from_status, to_status, actor_discord_id, note)
    VALUES (${trade.id}, NULL, 'OPEN', ${params.userDiscordId}, 'Trade created')
  `;

  logger.info({ tradeId: trade.id, userDiscordId: params.userDiscordId }, 'Trade created');
  return trade;
}

// ---------------------------------------------------------------------------
// Transition
// ---------------------------------------------------------------------------

export interface TransitionParams {
  tradeId:        string;
  to:             TradeStatus;
  actorDiscordId: string;
  note?:          string;
  // Optional field updates alongside the status change
  updates?: Partial<{
    exchangerId:       string;
    userWalletAddress: string;
    txId:              string;
    claimedAt:         Date;
    completedAt:       Date;
    expiresAt:         Date | null;
  }>;
}

export async function transitionTrade(params: TransitionParams): Promise<DbTrade> {
  return db.begin(async (sql) => {
    // Lock the trade row for this transaction
    const rows = await sql<DbTrade[]>`
      SELECT * FROM trades WHERE id = ${params.tradeId} FOR UPDATE
    `;
    if (rows.length === 0) throw new Error(`Trade ${params.tradeId} not found`);

    const trade = rows[0];

    if (!isTransitionAllowed(trade.status, params.to)) {
      throw new InvalidTransitionError(trade.status, params.to);
    }

    const updates = params.updates ?? {};

    const [updated] = await sql<DbTrade[]>`
      UPDATE trades SET
        status             = ${params.to},
        exchanger_id       = COALESCE(${updates.exchangerId ?? null}, exchanger_id),
        user_wallet_address= COALESCE(${updates.userWalletAddress ?? null}, user_wallet_address),
        tx_id              = COALESCE(${updates.txId ?? null}, tx_id),
        claimed_at         = COALESCE(${updates.claimedAt?.toISOString() ?? null}, claimed_at),
        completed_at       = COALESCE(${updates.completedAt?.toISOString() ?? null}, completed_at),
        expires_at         = ${updates.expiresAt !== undefined ? (updates.expiresAt?.toISOString() ?? null) : sql`expires_at`}
      WHERE id = ${params.tradeId}
      RETURNING *
    `;

    await sql`
      INSERT INTO trade_logs (trade_id, from_status, to_status, actor_discord_id, note)
      VALUES (
        ${params.tradeId},
        ${trade.status},
        ${params.to},
        ${params.actorDiscordId},
        ${params.note ?? null}
      )
    `;

    logger.info(
      { tradeId: params.tradeId, from: trade.status, to: params.to, actor: params.actorDiscordId },
      'Trade state transition',
    );

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getTradeById(tradeId: string): Promise<DbTrade | null> {
  const rows = await db<DbTrade[]>`SELECT * FROM trades WHERE id = ${tradeId}`;
  return rows[0] ?? null;
}

export async function getTradeByChannelId(channelId: string): Promise<DbTrade | null> {
  const rows = await db<DbTrade[]>`
    SELECT * FROM trades WHERE ticket_channel_id = ${channelId}
  `;
  return rows[0] ?? null;
}

export async function getTradesByStatus(status: TradeStatus, limit = 50): Promise<DbTrade[]> {
  return db<DbTrade[]>`
    SELECT * FROM trades WHERE status = ${status}
    ORDER BY created_at DESC LIMIT ${limit}
  `;
}

export async function getActiveTrades(): Promise<DbTrade[]> {
  return db<DbTrade[]>`
    SELECT * FROM trades
    WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED')
    ORDER BY created_at DESC
  `;
}

export async function getTradeLog(tradeId: string): Promise<DbTradeLog[]> {
  return db<DbTradeLog[]>`
    SELECT * FROM trade_logs WHERE trade_id = ${tradeId} ORDER BY created_at ASC
  `;
}

export async function getOpenTrades(): Promise<DbTrade[]> {
  return db<DbTrade[]>`
    SELECT * FROM trades WHERE status = 'OPEN' ORDER BY created_at ASC
  `;
}

/** All trades for an exchanger that are actively needing action. */
export async function getExchangerActiveTrades(exchangerId: string): Promise<DbTrade[]> {
  return db<DbTrade[]>`
    SELECT * FROM trades
    WHERE exchanger_id = ${exchangerId}
      AND status NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED')
    ORDER BY created_at DESC
  `;
}
