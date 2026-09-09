import { db } from '../db/client';
import type { Asset } from '../types';

export async function queueWithdrawal(params: {
  tradeId: string | null;
  exchangerId: string;
  asset: Asset;
  amount: string;
  destination: string;
}): Promise<string> {
  // Standalone exchanger withdrawals have no trade_id — we cannot use
  // ON CONFLICT (trade_id) when trade_id is NULL because NULL != NULL in SQL.
  // For trade-linked withdrawals we do want idempotency, so use a conditional upsert.
  if (params.tradeId !== null) {
    const [row] = await db<{ id: string }[]>`
      INSERT INTO withdrawals (trade_id, exchanger_id, asset, amount, destination)
      VALUES (${params.tradeId}, ${params.exchangerId}, ${params.asset}, ${params.amount}, ${params.destination})
      ON CONFLICT (trade_id) WHERE trade_id IS NOT NULL DO UPDATE
        SET destination     = EXCLUDED.destination,
            status          = CASE
              WHEN withdrawals.status = 'FAILED' THEN 'PENDING'
              ELSE withdrawals.status
            END,
            next_attempt_at = CASE
              WHEN withdrawals.status = 'FAILED' THEN NOW()
              ELSE withdrawals.next_attempt_at
            END,
            updated_at      = NOW()
      RETURNING id
    `;
    return row.id;
  }

  // Standalone withdrawal — always insert a fresh row (no dedup needed;
  // caller already deducted the balance atomically).
  const [row] = await db<{ id: string }[]>`
    INSERT INTO withdrawals (trade_id, exchanger_id, asset, amount, destination)
    VALUES (NULL, ${params.exchangerId}, ${params.asset}, ${params.amount}, ${params.destination})
    RETURNING id
  `;
  return row.id;
}
