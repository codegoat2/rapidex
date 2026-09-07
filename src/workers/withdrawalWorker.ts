import cron from 'node-cron';
import { db } from '../db/client';
import { logger } from '../utils/logger';
import { sendExchangerWithdrawal, sendTradePayment } from '../engine/txEngine';
import type { DbTrade } from '../types';
import { adminCredit } from '../ledger/ledgerService';
import { makeIdempotencyKey } from '../security/idempotency';

const log = logger.child({ worker: 'withdrawal' });

export function startWithdrawalWorker(): void {
  log.info('Withdrawal worker starting (every 15 seconds)');
  cron.schedule('*/15 * * * * *', () => {
    void processNextWithdrawal().catch((err) => log.error({ err }, 'Withdrawal worker run failed'));
  });
}

async function processNextWithdrawal(): Promise<void> {
  const withdrawal = await db.begin(async (sql) => {
    const rows = await sql<{
      id: string;
      trade_id: string | null;
      exchanger_id: string;
      asset: import('../types').Asset;
      amount: string;
      destination: string;
      attempt_count: number;
    }[]>`
      SELECT id, trade_id, exchanger_id, asset, amount, destination, attempt_count
      FROM withdrawals
      WHERE status = 'PENDING' AND next_attempt_at <= NOW()
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    if (rows.length === 0) return null;

    const [claimed] = await sql<typeof rows>`
      UPDATE withdrawals
      SET status = 'PROCESSING', attempt_count = attempt_count + 1, updated_at = NOW()
      WHERE id = ${rows[0].id}
      RETURNING id, trade_id, exchanger_id, attempt_count
    `;
    return claimed;
  });

  if (!withdrawal) return;

  try {
    if (withdrawal.trade_id) {
      const [trade] = await db<DbTrade[]>`
        SELECT * FROM trades WHERE id = ${withdrawal.trade_id}
      `;
      if (!trade) throw new Error(`Trade ${withdrawal.trade_id} not found`);
      await sendTradePayment(trade, withdrawal.exchanger_id, 'SYSTEM', true);
    } else {
      const txId = await sendExchangerWithdrawal({
        withdrawalId: withdrawal.id,
        exchangerId: withdrawal.exchanger_id,
        asset: withdrawal.asset,
        amount: withdrawal.amount,
        destination: withdrawal.destination,
      });
      await db`
        UPDATE withdrawals SET tx_id = ${txId}, updated_at = NOW()
        WHERE id = ${withdrawal.id}
      `;
    }
    await db`
      UPDATE withdrawals
      SET status = 'BROADCAST', updated_at = NOW()
      WHERE id = ${withdrawal.id}
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryDelaySeconds = Math.min(3600, 15 * 2 ** Math.min(withdrawal.attempt_count, 8));
    if (!withdrawal.trade_id && withdrawal.attempt_count >= 8) {
      await adminCredit({
        exchangerId: withdrawal.exchanger_id,
        asset: withdrawal.asset,
        amount: withdrawal.amount,
        reference: `Refund for failed exchanger withdrawal ${withdrawal.id}`,
        idempotencyKey: makeIdempotencyKey('WITHDRAWAL_REFUND', withdrawal.id),
      });
    }
    await db`
      UPDATE withdrawals
      SET status = CASE WHEN attempt_count >= 8 THEN 'FAILED' ELSE 'PENDING' END,
          last_error = ${message},
          next_attempt_at = NOW() + (${retryDelaySeconds} * INTERVAL '1 second'),
          updated_at = NOW()
      WHERE id = ${withdrawal.id}
    `;
    log.error({ err: error, withdrawalId: withdrawal.id, attempt: withdrawal.attempt_count }, 'Withdrawal attempt failed');
  }
}
