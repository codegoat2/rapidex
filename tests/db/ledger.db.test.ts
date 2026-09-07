/**
 * DB integration tests — Financial Ledger
 *
 * Requires a real database (DATABASE_URL in .env.test).
 * Runs serially — financial operations must not race.
 *
 * Tests:
 *   - recordDeposit credits correctly
 *   - lockEscrow blocks when insufficient balance
 *   - lockEscrow is atomic (concurrent claims only one wins)
 *   - releaseEscrow restores available balance
 *   - Duplicate idempotency key is safely ignored
 *   - adminCredit / adminDebit work correctly
 */

import { randomUUID } from 'crypto';
import postgres from 'postgres';
import {
  recordDeposit,
  lockEscrow,
  releaseEscrow,
  adminCredit,
  adminDebit,
  getBalance,
  InsufficientBalanceError,
} from '../../src/ledger/ledgerService';
import {
  depositKey,
  escrowLockKey,
  escrowReleaseKey,
  manualAdjustmentKey,
} from '../../src/security/idempotency';

// ---------------------------------------------------------------------------
// Test DB setup helpers
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL must be set to run DB integration tests');
}

const sql = postgres(DATABASE_URL, {
  ssl: process.env['NODE_ENV'] === 'production' ? 'require' : 'prefer',
  max: 5,
});

async function createTestExchanger(): Promise<{ userId: string; exchangerId: string }> {
  const discordId = `test-${randomUUID()}`;
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (discord_id, discord_username)
    VALUES (${discordId}, 'TestExchanger')
    RETURNING id
  `;
  const [exchanger] = await sql<{ id: string }[]>`
    INSERT INTO exchangers (user_id, discord_id, discord_username, verified_by_discord_id)
    VALUES (${user.id}, ${discordId}, 'TestExchanger', 'SYSTEM')
    RETURNING id
  `;
  return { userId: user.id, exchangerId: exchanger.id };
}

async function cleanupExchanger(exchangerId: string, userId: string): Promise<void> {
  await sql`DELETE FROM ledger_entries WHERE exchanger_id = ${exchangerId}`;
  await sql`DELETE FROM exchangers WHERE id = ${exchangerId}`;
  await sql`DELETE FROM users WHERE id = ${userId}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Ledger DB integration', () => {
  let exchangerId: string;
  let userId: string;

  beforeEach(async () => {
    const ex = await createTestExchanger();
    exchangerId = ex.exchangerId;
    userId      = ex.userId;
  });

  afterEach(async () => {
    await cleanupExchanger(exchangerId, userId);
  });

  afterAll(async () => {
    await sql.end();
  });

  // ------------------------------------------------------------------
  test('recordDeposit credits available balance', async () => {
    const key = depositKey('test-tx-001', 'BTC', exchangerId);
    await recordDeposit({
      exchangerId, asset: 'BTC', amount: '0.5',
      reference: 'Test deposit', idempotencyKey: key,
    });

    const bal = await getBalance(exchangerId, 'BTC');
    expect(parseFloat(bal.available)).toBeCloseTo(0.5, 8);
    expect(parseFloat(bal.escrow)).toBe(0);
  });

  // ------------------------------------------------------------------
  test('lockEscrow moves from available to escrow', async () => {
    await recordDeposit({
      exchangerId, asset: 'BTC', amount: '1.0',
      reference: 'Deposit', idempotencyKey: depositKey('tx-002', 'BTC', exchangerId),
    });

    await lockEscrow({
      exchangerId, tradeId: randomUUID(), asset: 'BTC', amount: '0.4',
      idempotencyKey: escrowLockKey(randomUUID(), exchangerId),
    });

    const bal = await getBalance(exchangerId, 'BTC');
    expect(parseFloat(bal.available)).toBeCloseTo(0.6, 8);
    expect(parseFloat(bal.escrow)).toBeCloseTo(0.4, 8);
  });

  // ------------------------------------------------------------------
  test('lockEscrow throws InsufficientBalanceError when balance is too low', async () => {
    await recordDeposit({
      exchangerId, asset: 'ETH', amount: '0.1',
      reference: 'Small deposit', idempotencyKey: depositKey('tx-003', 'ETH', exchangerId),
    });

    await expect(
      lockEscrow({
        exchangerId, tradeId: randomUUID(), asset: 'ETH', amount: '1.0',
        idempotencyKey: escrowLockKey(randomUUID(), exchangerId),
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
  });

  // ------------------------------------------------------------------
  test('concurrent lockEscrow attempts — only one wins if balance is tight', async () => {
    await recordDeposit({
      exchangerId, asset: 'BTC', amount: '0.5',
      reference: 'Deposit', idempotencyKey: depositKey('tx-004', 'BTC', exchangerId),
    });

    const tradeId1 = randomUUID();
    const tradeId2 = randomUUID();

    // Launch both simultaneously
    const results = await Promise.allSettled([
      lockEscrow({
        exchangerId, tradeId: tradeId1, asset: 'BTC', amount: '0.5',
        idempotencyKey: escrowLockKey(tradeId1, exchangerId),
      }),
      lockEscrow({
        exchangerId, tradeId: tradeId2, asset: 'BTC', amount: '0.5',
        idempotencyKey: escrowLockKey(tradeId2, exchangerId),
      }),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected  = results.filter(r => r.status === 'rejected');

    // Exactly one must succeed
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientBalanceError);

    // Balance must be exactly 0 available, 0.5 escrow
    const bal = await getBalance(exchangerId, 'BTC');
    expect(parseFloat(bal.available)).toBeCloseTo(0, 8);
    expect(parseFloat(bal.escrow)).toBeCloseTo(0.5, 8);
  });

  // ------------------------------------------------------------------
  test('releaseEscrow restores available balance', async () => {
    const tradeId = randomUUID();

    await recordDeposit({
      exchangerId, asset: 'LTC', amount: '5.0',
      reference: 'Deposit', idempotencyKey: depositKey('tx-005', 'LTC', exchangerId),
    });
    await lockEscrow({
      exchangerId, tradeId, asset: 'LTC', amount: '2.0',
      idempotencyKey: escrowLockKey(tradeId, exchangerId),
    });
    await releaseEscrow({
      exchangerId, tradeId, asset: 'LTC', amount: '2.0',
      idempotencyKey: escrowReleaseKey(tradeId, 'CANCEL'),
    });

    const bal = await getBalance(exchangerId, 'LTC');
    expect(parseFloat(bal.available)).toBeCloseTo(5.0, 8);
    expect(parseFloat(bal.escrow)).toBeCloseTo(0, 8);
  });

  // ------------------------------------------------------------------
  test('duplicate idempotency key is silently ignored (no double-credit)', async () => {
    const key = depositKey('tx-dupe', 'BTC', exchangerId);

    await recordDeposit({
      exchangerId, asset: 'BTC', amount: '1.0',
      reference: 'First', idempotencyKey: key,
    });
    await recordDeposit({
      exchangerId, asset: 'BTC', amount: '1.0',
      reference: 'Duplicate — must be ignored', idempotencyKey: key,
    });

    const bal = await getBalance(exchangerId, 'BTC');
    expect(parseFloat(bal.available)).toBeCloseTo(1.0, 8); // NOT 2.0
  });

  // ------------------------------------------------------------------
  test('adminCredit increases available balance', async () => {
    const key = manualAdjustmentKey(exchangerId, 'MANUAL_CREDIT', 'admin', Date.now());
    await adminCredit({
      exchangerId, asset: 'ETH', amount: '0.25',
      reference: 'Test credit', idempotencyKey: key,
    });

    const bal = await getBalance(exchangerId, 'ETH');
    expect(parseFloat(bal.available)).toBeCloseTo(0.25, 8);
  });

  // ------------------------------------------------------------------
  test('adminDebit decreases available balance', async () => {
    const creditKey = manualAdjustmentKey(exchangerId, 'MANUAL_CREDIT', 'admin', 1000);
    await adminCredit({
      exchangerId, asset: 'ETH', amount: '1.0',
      reference: 'Setup', idempotencyKey: creditKey,
    });

    const debitKey = manualAdjustmentKey(exchangerId, 'MANUAL_DEBIT', 'admin', 2000);
    await adminDebit({
      exchangerId, asset: 'ETH', amount: '0.3',
      reference: 'Test debit', idempotencyKey: debitKey,
    });

    const bal = await getBalance(exchangerId, 'ETH');
    expect(parseFloat(bal.available)).toBeCloseTo(0.7, 8);
  });

  // ------------------------------------------------------------------
  test('adminDebit fails on insufficient balance', async () => {
    const key = manualAdjustmentKey(exchangerId, 'MANUAL_DEBIT', 'admin', Date.now());
    await expect(
      adminDebit({
        exchangerId, asset: 'BTC', amount: '999',
        reference: 'Should fail', idempotencyKey: key,
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
  });
});
