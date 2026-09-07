/**
 * Database client — Supabase (PostgreSQL) with connection pooling.
 *
 * Supabase provides two connection strings:
 *
 *   1. Direct connection (port 5432)  — used for migrations and long-lived
 *      server processes. Set DATABASE_URL to this.
 *
 *   2. Pooler / pgBouncer (port 6543) — used when you need many short-lived
 *      connections (e.g. serverless). Set DATABASE_POOL_URL to this.
 *      The pooler URL includes ?pgbouncer=true which the postgres driver
 *      needs to handle correctly (disables prepared statements).
 *
 * For Railway (always-on process), we use the direct connection by default.
 * If DATABASE_POOL_URL is set, it is used for the main query pool.
 *
 * The pool is a singleton — import `db` from this module everywhere.
 */

import postgres from 'postgres';
import { config } from '../config/env';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Connection string selection
// ---------------------------------------------------------------------------

// Use the pool URL if provided (Supabase transaction pooler on port 6543),
// otherwise fall back to the direct connection string.
const connectionString =
  process.env['DATABASE_POOL_URL'] ?? config.DATABASE_URL;

// Supabase pgBouncer requires prepared statements to be disabled
const isPgBouncer =
  connectionString.includes('pgbouncer=true') ||
  connectionString.includes(':6543/');

const sqlPool = postgres(connectionString, {
  max:             config.DATABASE_MAX_CONNECTIONS,
  idle_timeout:    Math.floor(config.DATABASE_IDLE_TIMEOUT_MS / 1000),
  connect_timeout: Math.floor(config.DATABASE_CONNECTION_TIMEOUT_MS / 1000),
  ssl:             'require', // Supabase always requires SSL
  // pgBouncer (transaction mode) doesn't support prepared statements
  prepare: !isPgBouncer,
  onnotice: (notice) => {
    logger.debug({ notice }, 'DB notice');
  },
  connection: {
    // Supabase requires application_name for connection tracking
    application_name: 'rapidex-bot',
  },
});

/**
 * The primary database client. Use this for all queries:
 *
 * ```ts
 * import { db } from '../db/client';
 * const rows = await db`SELECT * FROM users WHERE discord_id = ${id}`;
 * ```
 *
 * For transactions (always uses direct connection — pgBouncer
 * transaction mode doesn't support multi-statement transactions):
 * ```ts
 * await db.begin(async (sql) => {
 *   await sql`INSERT INTO ledger_entries ...`;
 *   await sql`UPDATE trades SET status = 'CLAIMED' ...`;
 * });
 * ```
 */
export const db = sqlPool;

// ---------------------------------------------------------------------------
// Direct connection (for migrations — bypasses pgBouncer)
// ---------------------------------------------------------------------------

/**
 * Returns a direct (non-pooled) connection for running migrations.
 * Always uses DATABASE_URL (direct, port 5432), never the pooler.
 * Caller must call .end() when done.
 */
export function createDirectConnection(): postgres.Sql {
  return postgres(config.DATABASE_URL, {
    max:             1,
    ssl:             'require',
    prepare:         true,
    connect_timeout: 30,
    connection:      { application_name: 'rapidex-migrate' },
  });
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function checkDatabaseHealth(): Promise<{ healthy: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await db`SELECT 1`;
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    return { healthy: false, latencyMs: Date.now() - start };
  }
}

export async function closeDatabase(): Promise<void> {
  logger.info('Closing database connection pool...');
  await db.end();
  logger.info('Database connection pool closed');
}
