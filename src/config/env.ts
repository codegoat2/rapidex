/**
 * Environment configuration loader.
 *
 * Reads all required environment variables at startup, validates them with Zod,
 * and exports a single typed `config` object used throughout the application.
 * The process exits immediately if any required variable is missing or invalid —
 * fail-fast is intentional for a financial system.
 */

import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // ---- Discord -------------------------------------------------------
  DISCORD_TOKEN:         z.string().min(1),
  DISCORD_CLIENT_ID:     z.string().min(1),
  DISCORD_GUILD_ID:      z.string().min(1),
  ROLE_ADMIN:            z.string().min(1),
  ROLE_EXCHANGER:        z.string().min(1),
  CHANNEL_ADMIN_ALERTS:  z.string().min(1),
  CHANNEL_ANNOUNCEMENTS: z.string().min(1),

  // ---- Database (Supabase) ------------------------------------------
  DATABASE_URL:      z.string().url(),
  DATABASE_POOL_URL: z.string().optional(), // Supabase pooler (port 6543), optional
  DATABASE_MAX_CONNECTIONS:        z.coerce.number().int().positive().default(20),
  DATABASE_IDLE_TIMEOUT_MS:        z.coerce.number().int().positive().default(30000),
  DATABASE_CONNECTION_TIMEOUT_MS:  z.coerce.number().int().positive().default(5000),

  // ---- Encryption ----------------------------------------------------
  ENCRYPTION_KEY: z.string().length(64, 'Must be 64 hex characters — run: openssl rand -hex 32'),

  // ---- HD Wallet -----------------------------------------------------
  MASTER_WALLET_MNEMONIC: z.string().min(1),

  // ---- NOWNodes (single provider for all chains) ---------------------
  NOWNODES_API_KEY: z.string().min(1),

  // ---- Dashboard -----------------------------------------------------
  DASHBOARD_SECRET: z.string().min(16, 'DASHBOARD_SECRET must be at least 16 characters — run: openssl rand -hex 24'),

  // ---- Network -------------------------------------------------------
  NETWORK: z.enum(['mainnet', 'testnet']).default('testnet'),

  // ---- Webhook HTTP server -------------------------------------------
  WEBHOOK_PORT:     z.coerce.number().int().positive().default(3000),
  WEBHOOK_BASE_URL: z.string().url(),

  // Shared webhook secret — used to verify incoming deposit poll notifications
  WEBHOOK_SECRET: z.string().min(16),

  // ---- Hot wallet addresses (for balance monitoring) -----------------
  HOT_WALLET_BTC: z.string().optional(),
  HOT_WALLET_LTC: z.string().optional(),
  HOT_WALLET_ETH: z.string().optional(),
  HOT_WALLET_SOL: z.string().optional(),

  // ---- Sentry --------------------------------------------------------
  SENTRY_DSN: z.string().optional(),

  // ---- Application ---------------------------------------------------
  NODE_ENV:  z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ---- Trade timeouts (minutes, unless noted) ------------------------
  TIMEOUT_OPEN_MINUTES:               z.coerce.number().int().positive().default(30),
  TIMEOUT_CLAIMED_MINUTES:            z.coerce.number().int().positive().default(60),
  TIMEOUT_FIAT_SENT_MINUTES:          z.coerce.number().int().positive().default(60),
  TIMEOUT_DISPUTED_HOURS:             z.coerce.number().int().positive().default(24),
  TIMEOUT_CRYPTO_SENT_CONFIRMATIONS:  z.coerce.number().int().positive().default(2),

  // ---- Rate limits ---------------------------------------------------
  RATE_LIMIT_TICKET_PER_USER_PER_HOUR:     z.coerce.number().int().positive().default(3),
  RATE_LIMIT_COMMANDS_PER_USER_PER_MINUTE: z.coerce.number().int().positive().default(10),

  // ---- Hot wallet alert thresholds -----------------------------------
  MIN_HOT_WALLET_BTC: z.coerce.number().positive().default(0.01),
  MIN_HOT_WALLET_LTC: z.coerce.number().positive().default(1.0),
  MIN_HOT_WALLET_ETH: z.coerce.number().positive().default(0.1),
  MIN_HOT_WALLET_SOL: z.coerce.number().positive().default(5.0),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.errors
    .map((e) => `  ${e.path.join('.')}: ${e.message}`)
    .join('\n');
  process.stderr.write(`\n[RapidEx] FATAL — Invalid environment:\n${errors}\n\n`);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
