/**
 * Idempotency key management.
 *
 * Every financial operation (ledger write, webhook processing) generates
 * a deterministic idempotency key so duplicate requests are safely ignored.
 *
 * Keys are stored in ledger_entries.idempotency_key (UNIQUE constraint)
 * and webhook_events.(provider, event_id) (composite UNIQUE).
 */

import { createHash } from 'crypto';

/**
 * Generates a deterministic idempotency key from input components.
 * The same inputs always produce the same key — safe to retry.
 *
 * @example
 * makeIdempotencyKey('DEPOSIT', exchangerId, txId, 'BTC')
 */
export function makeIdempotencyKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex');
}

/**
 * Key for a deposit credit (one per on-chain transaction per asset).
 */
export function depositKey(txId: string, asset: string, exchangerId: string): string {
  return makeIdempotencyKey('DEPOSIT', txId, asset, exchangerId);
}

/**
 * Key for an escrow lock (one per trade claim).
 */
export function escrowLockKey(tradeId: string, exchangerId: string): string {
  return makeIdempotencyKey('ESCROW_LOCK', tradeId, exchangerId);
}

/**
 * Key for an escrow release (one per trade completion or cancellation).
 */
export function escrowReleaseKey(tradeId: string, reason: 'COMPLETE' | 'CANCEL'): string {
  return makeIdempotencyKey('ESCROW_RELEASE', tradeId, reason);
}

/**
 * Key for a withdrawal (one per on-chain send per trade).
 */
export function withdrawalKey(tradeId: string, txId: string): string {
  return makeIdempotencyKey('WITHDRAWAL', tradeId, txId);
}

/**
 * Key for a fee deduction.
 */
export function feeKey(tradeId: string): string {
  return makeIdempotencyKey('FEE', tradeId);
}

/**
 * Key for a manual credit/debit by admin.
 */
export function manualAdjustmentKey(
  exchangerId: string,
  type: 'MANUAL_CREDIT' | 'MANUAL_DEBIT',
  adminDiscordId: string,
  timestamp: number,
): string {
  return makeIdempotencyKey(type, exchangerId, adminDiscordId, String(timestamp));
}
