/**
 * Double-Entry Financial Ledger Service
 *
 * This is the single source of truth for all balances.
 * Every unit of crypto that enters or leaves the system
 * goes through a function in this file — nothing else
 * touches ledger_entries directly.
 *
 * Balance model:
 *   available  = funds the exchanger can freely use or claim with
 *   escrow     = funds locked against an active trade
 *   total      = available + escrow
 *
 * Entry types and their effect:
 *   DEPOSIT        → available ↑
 *   ESCROW_LOCK    → available ↓, escrow ↑   (trade claimed)
 *   ESCROW_RELEASE → available ↑, escrow ↓   (trade cancelled / force-cancel)
 *   WITHDRAWAL     → escrow ↓                (crypto sent on-chain)
 *   FEE            → available ↓             (RapidEx fee deducted)
 *   MANUAL_CREDIT  → available ↑             (admin adjustment)
 *   MANUAL_DEBIT   → available ↓             (admin adjustment)
 *
 * Concurrency safety:
 *   All balance reads and writes happen inside a single DB transaction
 *   with SELECT ... FOR UPDATE on a per-(exchanger, asset) lock row.
 *   This serialises concurrent operations without application-level locks.
 */

import postgres from 'postgres';
import { db } from '../db/client';
import { isTransitionAllowed } from '../engine/tradeService';
import { logger } from '../utils/logger';
import type { Asset, LedgerEntryType, DbLedgerEntry, DbTrade } from '../types';

// Shared SQL type that works for both pool and transaction contexts
type AnySql = postgres.Sql;

// ---------------------------------------------------------------------------
// Public balance types
// ---------------------------------------------------------------------------

export interface Balance {
  asset: Asset;
  available: string;   // NUMERIC string — use BigDecimal in display layer
  escrow: string;
  total: string;
}

export interface AllBalances {
  [asset: string]: Balance;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reads the current available and escrow balance for one (exchanger, asset)
 * pair INSIDE an existing transaction, using FOR UPDATE to serialize writers.
 */
async function readBalanceLocked(
  sql: AnySql,
  exchangerId: string,
  asset: Asset,
): Promise<{ available: string; escrow: string }> {
  // Lock the logical balance even when no ledger row exists yet.
  await sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`${exchangerId}:${asset}`}, 0)
    )
  `;

  // We lock the most recent ledger row for this (exchanger, asset).
  // If no rows exist yet the balance is 0.
  const rows = await sql<{ balance_after: string; escrow_after: string }[]>`
    SELECT balance_after, escrow_after
    FROM ledger_entries
    WHERE exchanger_id = ${exchangerId}
      AND asset        = ${asset}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE
  `;

  if (rows.length === 0) {
    return { available: '0', escrow: '0' };
  }
  return {
    available: rows[0].balance_after,
    escrow:    rows[0].escrow_after,
  };
}

/**
 * Inserts a single ledger entry inside an existing transaction.
 */
async function insertEntry(
  sql: AnySql,
  params: {
    exchangerId:     string;
    tradeId:         string | null;
    type:            LedgerEntryType;
    asset:           Asset;
    amount:          string;
    balanceBefore:   string;
    balanceAfter:    string;
    escrowBefore:    string;
    escrowAfter:     string;
    reference:       string;
    idempotencyKey:  string;
  },
): Promise<DbLedgerEntry> {
  const [row] = await sql<DbLedgerEntry[]>`
    INSERT INTO ledger_entries (
      exchanger_id, trade_id, type, asset, amount,
      balance_before, balance_after,
      escrow_before,  escrow_after,
      reference, idempotency_key
    ) VALUES (
      ${params.exchangerId},
      ${params.tradeId},
      ${params.type},
      ${params.asset},
      ${params.amount},
      ${params.balanceBefore},
      ${params.balanceAfter},
      ${params.escrowBefore},
      ${params.escrowAfter},
      ${params.reference},
      ${params.idempotencyKey}
    )
    RETURNING *
  `;
  return row;
}

function add(a: string, b: string): string {
  // Use BigInt arithmetic on 18-decimal fixed-point numbers
  return bigAdd(a, b);
}

function sub(a: string, b: string): string {
  const result = bigSub(a, b);
  if (result.startsWith('-')) {
    throw new InsufficientBalanceError(
      `Cannot subtract ${b} from ${a} — would go negative`,
    );
  }
  return result;
}

const SCALE = 18n;
const FACTOR = 10n ** SCALE;

function toBigInt(s: string): bigint {
  // Parse a decimal string like "0.5" or "1234.000000000000000000"
  const [intPart, fracPart = ''] = s.split('.');
  const frac = fracPart.padEnd(Number(SCALE), '0').slice(0, Number(SCALE));
  return BigInt(intPart) * FACTOR + BigInt(frac);
}

function fromBigInt(n: bigint): string {
  const sign = n < 0n ? '-' : '';
  const abs = n < 0n ? -n : n;
  const intPart = abs / FACTOR;
  const fracPart = (abs % FACTOR).toString().padStart(Number(SCALE), '0');
  // Trim trailing zeros but keep at least 1 decimal place
  const trimmed = fracPart.replace(/0+$/, '') || '0';
  return `${sign}${intPart}.${trimmed}`;
}

function bigAdd(a: string, b: string): string {
  return fromBigInt(toBigInt(a) + toBigInt(b));
}

function bigSub(a: string, b: string): string {
  return fromBigInt(toBigInt(a) - toBigInt(b));
}

function bigGte(a: string, b: string): boolean {
  return toBigInt(a) >= toBigInt(b);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Records a blockchain deposit credit for an exchanger.
 * Idempotent — safe to call multiple times with the same key.
 */
export async function recordDeposit(params: {
  exchangerId:    string;
  asset:          Asset;
  amount:         string;
  reference:      string;
  idempotencyKey: string;
  tradeId?:       string;
}): Promise<DbLedgerEntry> {
  return db.begin(async (sql) => {
    // Check for existing entry (idempotency)
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
    `;
    if (existing.length > 0) {
      logger.warn({ idempotencyKey: params.idempotencyKey }, 'Duplicate deposit — skipping');
      const [entry] = await sql<DbLedgerEntry[]>`
        SELECT * FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
      `;
      return entry;
    }

    const { available, escrow } = await readBalanceLocked(sql as unknown as postgres.Sql, params.exchangerId, params.asset);
    const newAvailable = add(available, params.amount);

    const entry = await insertEntry(sql as unknown as postgres.Sql, {
      exchangerId:    params.exchangerId,
      tradeId:        params.tradeId ?? null,
      type:           'DEPOSIT',
      asset:          params.asset,
      amount:         params.amount,
      balanceBefore:  available,
      balanceAfter:   newAvailable,
      escrowBefore:   escrow,
      escrowAfter:    escrow,
      reference:      params.reference,
      idempotencyKey: params.idempotencyKey,
    });

    logger.info(
      { exchangerId: params.exchangerId, asset: params.asset, amount: params.amount },
      'Ledger: DEPOSIT recorded',
    );
    return entry;
  });
}

/**
 * Locks funds into escrow when an exchanger claims a trade.
 * Atomically checks available balance >= amount before locking.
 * Throws InsufficientBalanceError if balance is too low.
 */
export async function lockEscrow(params: {
  exchangerId:    string;
  tradeId:        string;
  asset:          Asset;
  amount:         string;
  idempotencyKey: string;
}): Promise<DbLedgerEntry> {
  return db.begin(async (sql) => {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
    `;
    if (existing.length > 0) {
      const [entry] = await sql<DbLedgerEntry[]>`
        SELECT * FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
      `;
      return entry;
    }

    const { available, escrow } = await readBalanceLocked(sql as unknown as postgres.Sql, params.exchangerId, params.asset);

    if (!bigGte(available, params.amount)) {
      throw new InsufficientBalanceError(
        `Insufficient balance: need ${params.amount} ${params.asset}, have ${available}`,
      );
    }

    const newAvailable = sub(available, params.amount);
    const newEscrow    = add(escrow, params.amount);

    const entry = await insertEntry(sql as unknown as postgres.Sql, {
      exchangerId:    params.exchangerId,
      tradeId:        params.tradeId,
      type:           'ESCROW_LOCK',
      asset:          params.asset,
      amount:         params.amount,
      balanceBefore:  available,
      balanceAfter:   newAvailable,
      escrowBefore:   escrow,
      escrowAfter:    newEscrow,
      reference:      `Escrow lock for trade ${params.tradeId}`,
      idempotencyKey: params.idempotencyKey,
    });

    logger.info(
      { exchangerId: params.exchangerId, tradeId: params.tradeId, amount: params.amount },
      'Ledger: ESCROW_LOCK recorded',
    );
    return entry;
  });
}

export async function claimTradeWithEscrow(params: {
  exchangerId: string;
  tradeId: string;
  asset: Asset;
  amount: string;
  idempotencyKey: string;
  actorDiscordId: string;
  note: string;
}): Promise<DbTrade> {
  return db.begin(async (sql) => {
    const [trade] = await sql<DbTrade[]>`
      SELECT * FROM trades WHERE id = ${params.tradeId} FOR UPDATE
    `;
    if (!trade) throw new Error(`Trade ${params.tradeId} not found`);
    if (trade.status !== 'OPEN') throw new Error(`Trade ${params.tradeId} is no longer open`);

    const existing = await sql<{ id: string }[]>`
      SELECT id FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
    `;
    if (existing.length === 0) {
      const { available, escrow } = await readBalanceLocked(sql as unknown as postgres.Sql, params.exchangerId, params.asset);
      if (!bigGte(available, params.amount)) {
        throw new InsufficientBalanceError(
          `Insufficient balance: need ${params.amount} ${params.asset}, have ${available}`,
        );
      }
      await insertEntry(sql as unknown as postgres.Sql, {
        exchangerId: params.exchangerId,
        tradeId: params.tradeId,
        type: 'ESCROW_LOCK',
        asset: params.asset,
        amount: params.amount,
        balanceBefore: available,
        balanceAfter: sub(available, params.amount),
        escrowBefore: escrow,
        escrowAfter: add(escrow, params.amount),
        reference: `Escrow lock for trade ${params.tradeId}`,
        idempotencyKey: params.idempotencyKey,
      });
    }

    const [claimed] = await sql<DbTrade[]>`
      UPDATE trades SET status = 'CLAIMED', exchanger_id = ${params.exchangerId}, claimed_at = NOW()
      WHERE id = ${params.tradeId}
      RETURNING *
    `;
    await sql`
      INSERT INTO trade_logs (trade_id, from_status, to_status, actor_discord_id, note)
      VALUES (${params.tradeId}, 'OPEN', 'CLAIMED', ${params.actorDiscordId}, ${params.note})
    `;
    const [pending] = await sql<DbTrade[]>`
      UPDATE trades SET status = 'FIAT_PENDING'
      WHERE id = ${params.tradeId}
      RETURNING *
    `;
    await sql`
      INSERT INTO trade_logs (trade_id, from_status, to_status, actor_discord_id, note)
      VALUES (${params.tradeId}, 'CLAIMED', 'FIAT_PENDING', ${params.actorDiscordId}, 'Awaiting fiat payment from user')
    `;
    void claimed;
    return pending;
  });
}

/**
 * Releases escrowed funds back to available (on trade cancel / force-cancel).
 */
export async function releaseEscrow(params: {
  exchangerId:    string;
  tradeId:        string;
  asset:          Asset;
  amount:         string;
  idempotencyKey: string;
}): Promise<DbLedgerEntry> {
  return db.begin(async (sql) => {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
    `;
    if (existing.length > 0) {
      const [entry] = await sql<DbLedgerEntry[]>`
        SELECT * FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
      `;
      return entry;
    }

    const { available, escrow } = await readBalanceLocked(sql as unknown as postgres.Sql, params.exchangerId, params.asset);
    const newEscrow    = sub(escrow, params.amount);
    const newAvailable = add(available, params.amount);

    const entry = await insertEntry(sql as unknown as postgres.Sql, {
      exchangerId:    params.exchangerId,
      tradeId:        params.tradeId,
      type:           'ESCROW_RELEASE',
      asset:          params.asset,
      amount:         params.amount,
      balanceBefore:  available,
      balanceAfter:   newAvailable,
      escrowBefore:   escrow,
      escrowAfter:    newEscrow,
      reference:      `Escrow released for trade ${params.tradeId}`,
      idempotencyKey: params.idempotencyKey,
    });

    logger.info(
      { exchangerId: params.exchangerId, tradeId: params.tradeId, amount: params.amount },
      'Ledger: ESCROW_RELEASE recorded',
    );
    return entry;
  });
}

export async function cancelTradeAndReleaseEscrow(params: {
  tradeId: string;
  exchangerId: string;
  asset: Asset;
  amount: string;
  idempotencyKey: string;
  actorDiscordId: string;
  note: string;
}): Promise<void> {
  await db.begin(async (sql) => {
    const [trade] = await sql<{ status: string }[]>`
      SELECT status FROM trades WHERE id = ${params.tradeId} FOR UPDATE
    `;
    if (!trade) throw new Error(`Trade ${params.tradeId} not found`);
    if (trade.status === 'CANCELLED') return;
    if (!isTransitionAllowed(trade.status as any, 'CANCELLED')) {
      throw new Error(`Trade ${params.tradeId} cannot be cancelled from ${trade.status}`);
    }

    const existing = await sql<{ id: string }[]>`
      SELECT id FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
    `;
    if (existing.length === 0) {
      const { available, escrow } = await readBalanceLocked(sql as unknown as postgres.Sql, params.exchangerId, params.asset);
      const newEscrow = sub(escrow, params.amount);

      await insertEntry(sql as unknown as postgres.Sql, {
        exchangerId: params.exchangerId,
        tradeId: params.tradeId,
        type: 'ESCROW_RELEASE',
        asset: params.asset,
        amount: params.amount,
        balanceBefore: available,
        balanceAfter: add(available, params.amount),
        escrowBefore: escrow,
        escrowAfter: newEscrow,
        reference: `Escrow released for trade ${params.tradeId}`,
        idempotencyKey: params.idempotencyKey,
      });
    }

    await sql`
      UPDATE trades SET status = 'CANCELLED' WHERE id = ${params.tradeId}
    `;
    await sql`
      INSERT INTO trade_logs (trade_id, from_status, to_status, actor_discord_id, note)
      VALUES (${params.tradeId}, ${trade.status}, 'CANCELLED', ${params.actorDiscordId}, ${params.note})
    `;
  });
}

/**
 * Records a withdrawal — funds leave the system (sent on-chain to user).
 * Deducts from escrow (not available — funds were already locked).
 */
export async function recordWithdrawal(params: {
  exchangerId:    string;
  tradeId:        string;
  asset:          Asset;
  amount:         string;
  txId:           string;
  idempotencyKey: string;
}): Promise<DbLedgerEntry> {
  return db.begin(async (sql) => {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
    `;
    if (existing.length > 0) {
      const [entry] = await sql<DbLedgerEntry[]>`
        SELECT * FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
      `;
      return entry;
    }

    const { available, escrow } = await readBalanceLocked(sql as unknown as postgres.Sql, params.exchangerId, params.asset);
    const newEscrow = sub(escrow, params.amount);

    const entry = await insertEntry(sql as unknown as postgres.Sql, {
      exchangerId:    params.exchangerId,
      tradeId:        params.tradeId,
      type:           'WITHDRAWAL',
      asset:          params.asset,
      amount:         params.amount,
      balanceBefore:  available,
      balanceAfter:   available,   // available unchanged — deducted from escrow
      escrowBefore:   escrow,
      escrowAfter:    newEscrow,
      reference:      `Withdrawal tx ${params.txId} for trade ${params.tradeId}`,
      idempotencyKey: params.idempotencyKey,
    });

    logger.info(
      { exchangerId: params.exchangerId, tradeId: params.tradeId, txId: params.txId },
      'Ledger: WITHDRAWAL recorded',
    );
    return entry;
  });
}

/**
 * Records a fee deduction.
 *
 * For a trade-linked fee the funds are in escrow at time of fee collection
 * (the trade has been RELEASE_PENDING → funds leave escrow via WITHDRAWAL,
 * then fee is deducted from escrow in the same accounting pass).
 * For non-trade fees (rare) the deduction comes from available.
 *
 * When tradeId is supplied: escrow ↓ (funds were locked there).
 * When tradeId is absent:   available ↓ (manual/standalone fee).
 */
export async function recordFee(params: {
  exchangerId:    string;
  tradeId:        string;
  asset:          Asset;
  amount:         string;
  idempotencyKey: string;
}): Promise<DbLedgerEntry> {
  return db.begin(async (sql) => {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
    `;
    if (existing.length > 0) {
      const [entry] = await sql<DbLedgerEntry[]>`
        SELECT * FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
      `;
      return entry;
    }

    const { available, escrow } = await readBalanceLocked(sql as unknown as postgres.Sql, params.exchangerId, params.asset);

    // Fee is collected from escrow (the trade amount was locked there when claimed)
    const newEscrow = sub(escrow, params.amount);

    const entry = await insertEntry(sql as unknown as postgres.Sql, {
      exchangerId:    params.exchangerId,
      tradeId:        params.tradeId,
      type:           'FEE',
      asset:          params.asset,
      amount:         params.amount,
      balanceBefore:  available,
      balanceAfter:   available,   // available unchanged
      escrowBefore:   escrow,
      escrowAfter:    newEscrow,   // escrow ↓
      reference:      `RapidEx fee for trade ${params.tradeId}`,
      idempotencyKey: params.idempotencyKey,
    });

    logger.info(
      { exchangerId: params.exchangerId, tradeId: params.tradeId, amount: params.amount },
      'Ledger: FEE recorded',
    );
    return entry;
  });
}

/**
 * Admin manual credit — increases available balance.
 */
export async function adminCredit(params: {
  exchangerId:    string;
  asset:          Asset;
  amount:         string;
  reference:      string;
  idempotencyKey: string;
}): Promise<DbLedgerEntry> {
  return db.begin(async (sql) => {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
    `;
    if (existing.length > 0) {
      const [entry] = await sql<DbLedgerEntry[]>`
        SELECT * FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
      `;
      return entry;
    }

    const { available, escrow } = await readBalanceLocked(sql as unknown as postgres.Sql, params.exchangerId, params.asset);
    const newAvailable = add(available, params.amount);

    const entry = await insertEntry(sql as unknown as postgres.Sql, {
      exchangerId:    params.exchangerId,
      tradeId:        null,
      type:           'MANUAL_CREDIT',
      asset:          params.asset,
      amount:         params.amount,
      balanceBefore:  available,
      balanceAfter:   newAvailable,
      escrowBefore:   escrow,
      escrowAfter:    escrow,
      reference:      params.reference,
      idempotencyKey: params.idempotencyKey,
    });

    logger.info(
      { exchangerId: params.exchangerId, asset: params.asset, amount: params.amount },
      'Ledger: MANUAL_CREDIT recorded',
    );
    return entry;
  });
}

/**
 * Admin manual debit — decreases available balance.
 * Throws InsufficientBalanceError if balance would go negative.
 */
export async function adminDebit(params: {
  exchangerId:    string;
  asset:          Asset;
  amount:         string;
  reference:      string;
  idempotencyKey: string;
}): Promise<DbLedgerEntry> {
  return db.begin(async (sql) => {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
    `;
    if (existing.length > 0) {
      const [entry] = await sql<DbLedgerEntry[]>`
        SELECT * FROM ledger_entries WHERE idempotency_key = ${params.idempotencyKey}
      `;
      return entry;
    }

    const { available, escrow } = await readBalanceLocked(sql as unknown as postgres.Sql, params.exchangerId, params.asset);

    if (!bigGte(available, params.amount)) {
      throw new InsufficientBalanceError(
        `Insufficient balance for debit: need ${params.amount} ${params.asset}, have ${available}`,
      );
    }

    const newAvailable = sub(available, params.amount);

    const entry = await insertEntry(sql as unknown as postgres.Sql, {
      exchangerId:    params.exchangerId,
      tradeId:        null,
      type:           'MANUAL_DEBIT',
      asset:          params.asset,
      amount:         params.amount,
      balanceBefore:  available,
      balanceAfter:   newAvailable,
      escrowBefore:   escrow,
      escrowAfter:    escrow,
      reference:      params.reference,
      idempotencyKey: params.idempotencyKey,
    });

    logger.info(
      { exchangerId: params.exchangerId, asset: params.asset, amount: params.amount },
      'Ledger: MANUAL_DEBIT recorded',
    );
    return entry;
  });
}

// ---------------------------------------------------------------------------
// Balance reads
// ---------------------------------------------------------------------------

/**
 * Returns current available and escrow balance for one (exchanger, asset).
 */
export async function getBalance(exchangerId: string, asset: Asset): Promise<Balance> {
  const rows = await db<{ balance_after: string; escrow_after: string }[]>`
    SELECT balance_after, escrow_after
    FROM ledger_entries
    WHERE exchanger_id = ${exchangerId}
      AND asset        = ${asset}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;

  const available = rows[0]?.balance_after ?? '0';
  const escrow    = rows[0]?.escrow_after  ?? '0';
  const total     = add(available, escrow);

  return { asset, available, escrow, total };
}

/**
 * Returns balances for all assets for an exchanger.
 */
export async function getAllBalances(exchangerId: string): Promise<AllBalances> {
  const assets: Asset[] = ['BTC', 'LTC', 'ETH', 'SOL', 'BNB', 'USDT_BEP20'];
  const result: AllBalances = {};

  await Promise.all(
    assets.map(async (asset) => {
      result[asset] = await getBalance(exchangerId, asset);
    }),
  );

  return result;
}

/**
 * Returns all ledger entries for an exchanger (newest first).
 * Optional asset filter.
 */
export async function getLedgerHistory(
  exchangerId: string,
  asset?: Asset,
  limit = 50,
): Promise<DbLedgerEntry[]> {
  if (asset) {
    return db<DbLedgerEntry[]>`
      SELECT * FROM ledger_entries
      WHERE exchanger_id = ${exchangerId}
        AND asset        = ${asset}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }
  return db<DbLedgerEntry[]>`
    SELECT * FROM ledger_entries
    WHERE exchanger_id = ${exchangerId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InsufficientBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}
