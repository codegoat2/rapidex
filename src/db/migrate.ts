/**
 * Migration runner.
 *
 * Reads SQL migration files from src/db/migrations/ in filename order,
 * checks the schema_migrations table to see which have already been applied,
 * and runs any that haven't.
 *
 * Usage:
 *   npm run migrate            — apply pending migrations
 *   npm run migrate:rollback   — not supported (use additive migrations only)
 *
 * Design principles:
 *   • Migrations are additive only — never destructive
 *   • Each migration file is wrapped in a BEGIN/COMMIT (already in the SQL)
 *   • Applied migrations are recorded in schema_migrations
 *   • Re-running migrate is always safe (idempotent)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

// Always use the direct connection string for migrations (never pgBouncer/pooler)
const connectionString = process.env['DATABASE_URL'];

if (!connectionString) {
  process.stderr.write('FATAL: DATABASE_URL is not set\n');
  process.exit(1);
}

// Supabase requires SSL and no pgBouncer for migrations (DDL needs real transactions)
const sql = postgres(connectionString, {
  ssl:             'require',
  max:             1,
  prepare:         true,
  connect_timeout: 30,
  connection:      { application_name: 'rapidex-migrate' },
});

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function getAppliedMigrations(): Promise<Set<string>> {
  // The schema_migrations table might not exist yet on first run
  try {
    const rows = await sql<{ version: string }[]>`
      SELECT version FROM schema_migrations ORDER BY version
    `;
    return new Set(rows.map((r) => r.version));
  } catch {
    // Table doesn't exist yet — that's fine, first migration will create it
    return new Set();
  }
}

async function runMigrations(): Promise<void> {
  console.log('[migrate] Starting RapidEx database migrations...\n');

  // Read all .sql files from the migrations directory, sorted by name
  const allFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (allFiles.length === 0) {
    console.log('[migrate] No migration files found.');
    return;
  }

  const applied = await getAppliedMigrations();
  const pending = allFiles.filter((f) => {
    const version = f.replace('.sql', '');
    return !applied.has(version);
  });

  if (pending.length === 0) {
    console.log('[migrate] All migrations already applied. Nothing to do.\n');
    return;
  }

  console.log(`[migrate] ${pending.length} pending migration(s):\n`);

  for (const file of pending) {
    const version = file.replace('.sql', '');
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sqlContent = fs.readFileSync(filePath, 'utf-8');

    console.log(`  → Applying: ${file}`);

    try {
      // Execute the full SQL file as-is (migrations include their own BEGIN/COMMIT)
      await sql.unsafe(sqlContent);
      console.log(`  ✓ Applied:  ${file}\n`);
    } catch (err) {
      console.error(`\n[migrate] FAILED on migration: ${file}`);
      console.error(err);
      process.exit(1);
    }
  }

  console.log('[migrate] All migrations applied successfully.\n');
}

async function main(): Promise<void> {
  try {
    await runMigrations();
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('[migrate] Unexpected error:', err);
  process.exit(1);
});
