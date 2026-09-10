/**
 * Environment configuration.
 *
 * Discord role/channel IDs are intentionally OPTIONAL here — they are
 * managed at runtime via the admin dashboard (bot_settings table).
 * The bot starts without them and reads live values from the DB.
 *
 * Only the truly secret / infrastructure values are required at startup.
 */

import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // ---- Discord (required to connect) --------------------------------
  DISCORD_TOKEN:     z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID:  z.string().min(1),

  // ---- Discord IDs — optional; set via dashboard Settings page ------
  ROLE_ADMIN:            z.string().default(''),
  ROLE_EXCHANGER:        z.string().default(''),
  CHANNEL_ADMIN_ALERTS:  z.string().default(''),
  CHANNEL_ANNOUNCEMENTS: z.string().default(''),
  CHANNEL_HISTORY:      z.string().default(''),
  TICKET_CATEGORY_ID:    z.string().default(''),
  FORUM_CHANNEL_ID:      z.string().default(''),

  // ---- Database (Supabase) ------------------------------------------
  DATABASE_URL:      z.string().url(),
  DATABASE_POOL_URL: z.string().optional(),
  DATABASE_MAX_CONNECTIONS:       z.coerce.number().int().positive().default(20),
  DATABASE_IDLE_TIMEOUT_MS:       z.coerce.number().int().positive().default(30000),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  // ---- Encryption ----------------------------------------------------
  ENCRYPTION_KEY: z.string().length(64, 'Must be 64 hex chars — run: openssl rand -hex 32'),

  // ---- HD Wallet -----------------------------------------------------
  MASTER_WALLET_MNEMONIC: z.string().min(1),

  // ---- NOWNodes ------------------------------------------------------
  NOWNODES_API_KEY: z.string().min(1),

  // ---- Dashboard -----------------------------------------------------
  DASHBOARD_SECRET: z.string().min(1),

  // ---- Network -------------------------------------------------------
  NETWORK: z.enum(['mainnet', 'testnet']).default('testnet'),

  // ---- HTTP server ---------------------------------------------------
  WEBHOOK_PORT:     z.coerce.number().int().positive().default(3000),
  WEBHOOK_BASE_URL: z.string().default('http://localhost:3000'),
  WEBHOOK_SECRET:   z.string().min(8).default('change-me-in-dashboard'),

  // ---- Hot wallet addresses (optional — set in dashboard) -----------
  HOT_WALLET_BTC: z.string().default(''),
  HOT_WALLET_LTC: z.string().default(''),
  HOT_WALLET_ETH: z.string().default(''),
  HOT_WALLET_SOL: z.string().default(''),
  HOT_WALLET_BNB: z.string().default(''),

  // ---- Sentry (optional) --------------------------------------------
  SENTRY_DSN: z.string().optional(),

  // ---- Application ---------------------------------------------------
  NODE_ENV:  z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ---- Timeouts (fallback defaults — overridden by bot_settings) ----
  TIMEOUT_OPEN_MINUTES:              z.coerce.number().int().positive().default(30),
  TIMEOUT_CLAIMED_MINUTES:           z.coerce.number().int().positive().default(60),
  TIMEOUT_FIAT_SENT_MINUTES:         z.coerce.number().int().positive().default(60),
  TIMEOUT_DISPUTED_HOURS:            z.coerce.number().int().positive().default(24),
  TIMEOUT_CRYPTO_SENT_CONFIRMATIONS: z.coerce.number().int().positive().default(2),

  // ---- Rate limits ---------------------------------------------------
  RATE_LIMIT_TICKET_PER_USER_PER_HOUR:     z.coerce.number().int().positive().default(3),
  RATE_LIMIT_COMMANDS_PER_USER_PER_MINUTE: z.coerce.number().int().positive().default(10),
  MIN_TRADE_AMOUNT: z.coerce.number().positive().default(0.000001),
  MAX_TRADE_AMOUNT: z.coerce.number().positive().default(1000000),

  // ---- Hot wallet alert thresholds -----------------------------------------
  MIN_HOT_WALLET_BTC: z.coerce.number().positive().default(0.01),
  MIN_HOT_WALLET_LTC: z.coerce.number().positive().default(1.0),
  MIN_HOT_WALLET_ETH: z.coerce.number().positive().default(0.1),
  MIN_HOT_WALLET_SOL: z.coerce.number().positive().default(5.0),
  MIN_HOT_WALLET_BNB: z.coerce.number().positive().default(0.5),
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
