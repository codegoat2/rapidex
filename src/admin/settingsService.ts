/**
 * Bot Settings Service
 *
 * Runtime-editable configuration stored in bot_settings table.
 * Values are cached for 60 seconds so every request doesn't hit the DB.
 */

import { db } from '../db/client';
import { logger } from '../utils/logger';

interface Setting {
  key:         string;
  value:       string;
  description: string;
  category:    string;
  updated_by:  string;
  updated_at:  Date;
}

// 60-second in-memory cache
let cache: Record<string, string> = {};
let cacheExpiresAt = 0;

const POSITIVE_INTEGER_SETTINGS = new Set([
  'TIMEOUT_OPEN_MINUTES', 'TIMEOUT_CLAIMED_MINUTES', 'TIMEOUT_FIAT_SENT_MINUTES',
  'TIMEOUT_DISPUTED_HOURS', 'TIMEOUT_CRYPTO_SENT_CONFIRMATIONS',
  'RATE_LIMIT_TICKET_PER_USER_PER_HOUR', 'RATE_LIMIT_COMMANDS_PER_USER_PER_MINUTE',
]);
const POSITIVE_NUMBER_SETTINGS = new Set([
  'MIN_HOT_WALLET_BTC', 'MIN_HOT_WALLET_LTC', 'MIN_HOT_WALLET_ETH', 'MIN_HOT_WALLET_SOL',
]);
const BOOLEAN_SETTINGS = new Set(['MAINTENANCE_MODE']);
const NETWORK_SETTINGS = new Set(['NETWORK']);
const ID_SETTINGS = new Set([
  'ROLE_ADMIN', 'ROLE_EXCHANGER', 'CHANNEL_ADMIN_ALERTS', 'CHANNEL_ANNOUNCEMENTS', 'TICKET_CATEGORY_ID',
]);

function validateSetting(key: string, value: string): void {
  if (POSITIVE_INTEGER_SETTINGS.has(key) && !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${key} must be a positive integer`);
  }
  if (POSITIVE_NUMBER_SETTINGS.has(key) && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
    throw new Error(`${key} must be a positive number`);
  }
  if (BOOLEAN_SETTINGS.has(key) && value !== 'true' && value !== 'false') {
    throw new Error(`${key} must be true or false`);
  }
  if (NETWORK_SETTINGS.has(key) && value !== 'mainnet' && value !== 'testnet') {
    throw new Error(`${key} must be mainnet or testnet`);
  }
  if (ID_SETTINGS.has(key) && value !== '' && !/^\d+$/.test(value)) {
    throw new Error(`${key} must be a Discord ID`);
  }
}

async function loadCache(): Promise<void> {
  const rows = await db<Setting[]>`SELECT * FROM bot_settings`;
  cache = {};
  for (const r of rows) cache[r.key] = r.value;
  cacheExpiresAt = Date.now() + 60_000;
}

export async function getSetting(key: string): Promise<string | null> {
  if (Date.now() > cacheExpiresAt) await loadCache();
  return cache[key] ?? null;
}

export async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const v = await getSetting(key);
  const n = v !== null ? parseFloat(v) : NaN;
  return isNaN(n) ? fallback : n;
}

export async function getSettingBool(key: string): Promise<boolean> {
  const v = await getSetting(key);
  return v === 'true';
}

export async function setSetting(key: string, value: string, updatedBy = 'SYSTEM'): Promise<void> {
  validateSetting(key, value);
  await db`
    INSERT INTO bot_settings (key, value, updated_by, updated_at)
    VALUES (${key}, ${value}, ${updatedBy}, NOW())
    ON CONFLICT (key) DO UPDATE
      SET value      = EXCLUDED.value,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
  `;
  cache[key] = value; // update in-place so cache is immediately consistent
  logger.info({ key, value }, 'Setting updated');
}

export async function setSettings(
  updates: Record<string, string>,
  updatedBy = 'SYSTEM',
): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    await setSetting(key, value, updatedBy);
  }
}

export async function getAllSettings(): Promise<Setting[]> {
  return db<Setting[]>`SELECT * FROM bot_settings ORDER BY category, key`;
}

export function invalidateCache(): void {
  cacheExpiresAt = 0;
}
