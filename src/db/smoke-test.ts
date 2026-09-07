/**
 * Database smoke test.
 *
 * Verifies:
 *   1. Database connection is alive
 *   2. All expected tables exist
 *   3. Basic INSERT / SELECT / UPDATE works
 *   4. DB-level transaction with rollback works
 *   5. Ledger entry can be inserted and balance read back correctly
 *   6. Idempotency key UNIQUE constraint fires on duplicate insert
 *   7. updated_at trigger fires on row update
 *
 * Run with: npm run smoke-test
 *
 * This script is intentionally self-contained (no imports from other
 * src modules) so it can run even before the full app is wired up.
 */

import 'dotenv/config';
import postgres from 'postgres';
import { randomUUID } from 'crypto';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  process.stderr.write('FATAL: DATABASE_URL is not set\n');
  process.exit(1);
}

const sql = postgres(connectionString, {
  ssl: process.env['NODE_ENV'] === 'production' ? 'require' : 'prefer',
  max: 5,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function pass(label: string): void {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label: string, err: unknown): void {
  console.error(`  ✗  ${label}`);
  console.error(`     ${String(err)}`);
  failed++;
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

async function testConnection(): Promise<void> {
  const [row] = await sql<[{ result: number }]>`SELECT 1 AS result`;
  if (row.result !== 1) throw new Error('Unexpected result from SELECT 1');
  pass('Database connection alive');
}

async function testTablesExist(): Promise<void> {
  const expectedTables = [
    'users',
    'exchangers',
    'deposit_addresses',
    'trades',
    'trade_logs',
    'ledger_entries',
    'audit_logs',
    'webhook_events',
    'hot_wallet_balances',
    'fee_config',
    'schema_migrations',
  ];

  const rows = await sql<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  `;

  const existing = new Set(rows.map((r) => r.tablename));
  const missing = expectedTables.filter((t) => !existing.has(t));

  if (missing.length > 0) {
    throw new Error(`Missing tables: ${missing.join(', ')}`);
  }
  pass(`All ${expectedTables.length} expected tables exist`);
}

async function testFeeConfigSeeded(): Promise<void> {
  const rows = await sql<{ asset: string }[]>`SELECT asset FROM fee_config ORDER BY asset`;
  const assets = rows.map((r) => r.asset).sort();
  const expected = ['BNB', 'BTC', 'ETH', 'LTC', 'SOL', 'USDT_BEP20'].sort();

  if (JSON.stringify(assets) !== JSON.stringify(expected)) {
    throw new Error(`Fee config assets mismatch. Got: ${assets.join(', ')}`);
  }
  pass('Fee config seeded with all 6 assets');
}

async function testUserInsertAndRead(): Promise<void> {
  const discordId = `smoke-test-user-${randomUUID()}`;
  const username = 'SmokeTestUser#0000';

  await sql`
    INSERT INTO users (discord_id, discord_username)
    VALUES (${discordId}, ${username})
  `;

  const [row] = await sql<{ discord_username: string }[]>`
    SELECT discord_username FROM users WHERE discord_id = ${discordId}
  `;

  if (row.discord_username !== username) {
    throw new Error('Read-back value does not match inserted value');
  }

  // Clean up
  await sql`DELETE FROM users WHERE discord_id = ${discordId}`;
  pass('INSERT / SELECT / DELETE on users table');
}

async function testTransactionRollback(): Promise<void> {
  const discordId = `smoke-test-rollback-${randomUUID()}`;

  // Wrap in a transaction that we deliberately roll back
  try {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO users (discord_id, discord_username)
        VALUES (${discordId}, 'RollbackTest')
      `;
      // Manually throw to trigger rollback
      throw new Error('intentional rollback');
    });
  } catch {
    // Expected — the BEGIN block threw
  }

  // The row must NOT exist after the rollback
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE discord_id = ${discordId}
  `;

  if (rows.length !== 0) {
    throw new Error('Row persisted after transaction rollback — rollback did not work');
  }
  pass('Transaction rollback correctly undoes changes');
}

async function testLedgerInsertAndBalance(): Promise<void> {
  // Create a temporary user + exchanger for this test
  const discordId = `smoke-exchanger-${randomUUID()}`;

  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (discord_id, discord_username)
    VALUES (${discordId}, 'SmokeExchanger')
    RETURNING id
  `;

  const [exchanger] = await sql<{ id: string }[]>`
    INSERT INTO exchangers (user_id, discord_id, discord_username, verified_by_discord_id)
    VALUES (${user.id}, ${discordId}, 'SmokeExchanger', 'SYSTEM')
    RETURNING id
  `;

  const exchangerId = exchanger.id;
  const idempotencyKey = `smoke-deposit-${randomUUID()}`;

  // Insert a DEPOSIT ledger entry
  await sql`
    INSERT INTO ledger_entries (
      exchanger_id, type, asset, amount,
      balance_before, balance_after,
      escrow_before, escrow_after,
      reference, idempotency_key
    ) VALUES (
      ${exchangerId}, 'DEPOSIT', 'BTC', 0.5,
      0, 0.5,
      0, 0,
      'Smoke test deposit', ${idempotencyKey}
    )
  `;

  // Read back balance as sum of ledger entries
  const [balRow] = await sql<{ available: string }[]>`
    SELECT
      SUM(CASE
        WHEN type IN ('DEPOSIT', 'ESCROW_RELEASE', 'MANUAL_CREDIT') THEN amount
        ELSE -amount
      END) AS available
    FROM ledger_entries
    WHERE exchanger_id = ${exchangerId}
      AND asset = 'BTC'
  `;

  const balance = parseFloat(balRow.available);
  if (Math.abs(balance - 0.5) > 0.000000001) {
    throw new Error(`Balance mismatch: expected 0.5, got ${balance}`);
  }
  pass('Ledger INSERT and balance calculation correct');

  // Verify UNIQUE constraint on idempotency_key
  try {
    await sql`
      INSERT INTO ledger_entries (
        exchanger_id, type, asset, amount,
        balance_before, balance_after,
        escrow_before, escrow_after,
        reference, idempotency_key
      ) VALUES (
        ${exchangerId}, 'DEPOSIT', 'BTC', 0.5,
        0.5, 1.0,
        0, 0,
        'Duplicate smoke test deposit', ${idempotencyKey}
      )
    `;
    throw new Error('Duplicate idempotency key was not rejected');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('duplicate') || message.includes('unique')) {
      pass('Idempotency key UNIQUE constraint prevents duplicate ledger entry');
    } else {
      throw err;
    }
  }

  // Clean up (delete in FK-safe order)
  await sql`DELETE FROM ledger_entries WHERE exchanger_id = ${exchangerId}`;
  await sql`DELETE FROM exchangers WHERE id = ${exchangerId}`;
  await sql`DELETE FROM users WHERE id = ${user.id}`;
}

async function testUpdatedAtTrigger(): Promise<void> {
  const discordId = `smoke-trigger-${randomUUID()}`;

  const [row] = await sql<{ id: string; updated_at: Date }[]>`
    INSERT INTO users (discord_id, discord_username)
    VALUES (${discordId}, 'TriggerTest')
    RETURNING id, updated_at
  `;

  const originalUpdatedAt = row.updated_at;

  // Wait 10ms to ensure clock tick
  await new Promise((r) => setTimeout(r, 10));

  const [updated] = await sql<{ updated_at: Date }[]>`
    UPDATE users SET discord_username = 'TriggerTestUpdated'
    WHERE id = ${row.id}
    RETURNING updated_at
  `;

  if (updated.updated_at <= originalUpdatedAt) {
    throw new Error('updated_at trigger did not advance timestamp on UPDATE');
  }
  pass('updated_at trigger fires correctly on row update');

  await sql`DELETE FROM users WHERE id = ${row.id}`;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  RapidEx — Database Smoke Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const tests: Array<[string, () => Promise<void>]> = [
    ['connection', testConnection],
    ['tables exist', testTablesExist],
    ['fee config seeded', testFeeConfigSeeded],
    ['user CRUD', testUserInsertAndRead],
    ['transaction rollback', testTransactionRollback],
    ['ledger insert + balance', testLedgerInsertAndBalance],
    ['updated_at trigger', testUpdatedAtTrigger],
  ];

  for (const [name, fn] of tests) {
    try {
      await fn();
    } catch (err) {
      fail(name, err);
    }
  }

  console.log(
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  );
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  await sql.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test runner error:', err);
  process.exit(1);
});
