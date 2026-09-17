import { db } from '../db/client';
import { getSetting } from '../admin/settingsService';
import type { Asset } from '../types';
import postgres from 'postgres';

const ASSETS: Asset[] = ['BTC', 'LTC', 'ETH', 'SOL', 'BNB', 'USDT_BEP20'];

function toUnits(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0').slice(0, 18));
}

function fromUnits(value: bigint): string {
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '') || '0';
  return `${whole}.${fraction}`;
}

function assertAsset(asset: string): asserts asset is Asset {
  if (!ASSETS.includes(asset as Asset)) throw new Error(`Unsupported asset: ${asset}`);
}

async function currentBalance(sql: postgres.Sql, asset: Asset): Promise<string> {
  const [row] = await sql<{ balance_after: string }[]>`
    SELECT balance_after FROM admin_profit_entries
    WHERE asset = ${asset}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE
  `;
  return row?.balance_after ?? '0';
}

export async function getAdminProfitBalances(): Promise<Record<Asset, string>> {
  const rows = await db<{ asset: Asset; balance_after: string }[]>`
    SELECT DISTINCT ON (asset) asset, balance_after
    FROM admin_profit_entries
    ORDER BY asset, created_at DESC, id DESC
  `;
  const balances = Object.fromEntries(ASSETS.map((asset) => [asset, '0'])) as Record<Asset, string>;
  for (const row of rows) balances[row.asset] = row.balance_after;
  return balances;
}

export async function requestAdminWithdrawal(params: {
  asset: Asset;
  amount: string;
  destination: string;
}): Promise<string> {
  assertAsset(params.asset);
  if (!/^\d+(?:\.\d+)?$/.test(params.amount) || toUnits(params.amount) <= 0n) {
    throw new Error('Withdrawal amount must be positive');
  }
  if (!params.destination.trim()) throw new Error('Withdrawal destination is required');

  const sourceExchangerId = await getSetting('ADMIN_EXCHANGER_ID');
  if (!sourceExchangerId) throw new Error('ADMIN_EXCHANGER_ID is not configured');

  return db.begin(async (sql) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`admin-profit:${params.asset}`}, 0))`;
    const balance = await currentBalance(sql as unknown as postgres.Sql, params.asset);
    if (toUnits(balance) < toUnits(params.amount)) {
      throw new Error(`Insufficient admin balance: have ${balance} ${params.asset}`);
    }

    const [withdrawal] = await sql<{ id: string }[]>`
      INSERT INTO admin_withdrawals (asset, amount, destination, source_exchanger_id)
      VALUES (${params.asset}, ${params.amount}, ${params.destination.trim()}, ${sourceExchangerId})
      RETURNING id
    `;
    await sql`
      INSERT INTO admin_profit_entries (
        asset, type, amount, balance_before, balance_after, reference, idempotency_key
      ) VALUES (
        ${params.asset}, 'WITHDRAWAL', ${params.amount}, ${balance},
        ${fromUnits(toUnits(balance) - toUnits(params.amount))},
        ${`Admin withdrawal ${withdrawal.id}`}, ${`ADMIN_WITHDRAWAL:${withdrawal.id}`}
      )
    `;
    return withdrawal.id;
  });
}

export async function refundAdminWithdrawal(withdrawalId: string, reason: string): Promise<void> {
  await db.begin(async (sql) => {
    const [withdrawal] = await sql<{ asset: Asset; amount: string }[]>`
      SELECT asset, amount FROM admin_withdrawals WHERE id = ${withdrawalId} FOR UPDATE
    `;
    if (!withdrawal) return;
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM admin_profit_entries WHERE idempotency_key = ${`ADMIN_REFUND:${withdrawalId}`}
    `;
    if (existing.length > 0) return;
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`admin-profit:${withdrawal.asset}`}, 0))`;
    const balance = await currentBalance(sql as unknown as postgres.Sql, withdrawal.asset);
    await sql`
      INSERT INTO admin_profit_entries (
        asset, type, amount, balance_before, balance_after, reference, idempotency_key
      ) VALUES (
        ${withdrawal.asset}, 'WITHDRAWAL_REFUND', ${withdrawal.amount}, ${balance},
        ${fromUnits(toUnits(balance) + toUnits(withdrawal.amount))},
        ${reason}, ${`ADMIN_REFUND:${withdrawalId}`}
      )
    `;
  });
}

export async function listAdminWithdrawals(): Promise<unknown> {
  return db`
    SELECT * FROM admin_withdrawals ORDER BY created_at DESC LIMIT 200
  `;
}
