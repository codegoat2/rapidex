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
