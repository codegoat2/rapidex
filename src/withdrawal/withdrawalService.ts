import { db } from '../db/client';
import type { Asset } from '../types';

export async function queueWithdrawal(params: {
  tradeId: string | null;
  exchangerId: string;
  asset: Asset;
  amount: string;
  destination: string;
}): Promise<string> {
  const [row] = await db<{ id: string }[]>`
    INSERT INTO withdrawals (trade_id, exchanger_id, asset, amount, destination)
    VALUES (${params.tradeId}, ${params.exchangerId}, ${params.asset}, ${params.amount}, ${params.destination})
    ON CONFLICT (trade_id) DO UPDATE
      SET destination = EXCLUDED.destination,
          status = CASE WHEN withdrawals.status = 'FAILED' THEN 'PENDING' ELSE withdrawals.status END,
          next_attempt_at = CASE WHEN withdrawals.status = 'FAILED' THEN NOW() ELSE withdrawals.next_attempt_at END,
          updated_at = NOW()
    RETURNING id
  `;
  return row.id;
}
