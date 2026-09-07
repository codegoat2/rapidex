/**
 * Address Service — persists and retrieves exchanger deposit addresses.
 *
 * Generates addresses on first verification, stores derivation paths in DB.
 * Private keys are NEVER stored — always re-derived from the master seed
 * at transaction time using the stored path.
 */

import { db } from '../db/client';
import { deriveAllAddresses } from './hdWallet';
import { logger } from '../utils/logger';
import type { Asset, Chain, DbDepositAddress } from '../types';

/**
 * Returns the next available account index for HD derivation.
 * Each exchanger gets a unique index — never reused.
 */
async function nextAccountIndex(): Promise<number> {
  const [row] = await db<{ max_index: number | null }[]>`
    SELECT MAX(CAST(SPLIT_PART(derivation_path, '''/', 3) AS INTEGER)) AS max_index
    FROM deposit_addresses
  `;
  return (row.max_index ?? -1) + 1;
}

/**
 * Generates and stores all deposit addresses for a new exchanger.
 * Idempotent — returns existing addresses if already created.
 */
export async function provisionAddresses(exchangerId: string): Promise<DbDepositAddress[]> {
  // Check if already provisioned
  const existing = await db<DbDepositAddress[]>`
    SELECT * FROM deposit_addresses WHERE exchanger_id = ${exchangerId}
  `;
  if (existing.length > 0) {
    logger.info({ exchangerId }, 'Deposit addresses already provisioned');
    return existing;
  }

  const accountIndex = await nextAccountIndex();
  const derived = deriveAllAddresses(accountIndex);

  const inserted: DbDepositAddress[] = [];
  for (const addr of derived) {
    const [row] = await db<DbDepositAddress[]>`
      INSERT INTO deposit_addresses (exchanger_id, asset, chain, address, derivation_path)
      VALUES (${exchangerId}, ${addr.asset}, ${addr.chain}, ${addr.address}, ${addr.derivationPath})
      ON CONFLICT (exchanger_id, asset) DO UPDATE
        SET address = EXCLUDED.address,
            derivation_path = EXCLUDED.derivation_path
      RETURNING *
    `;
    inserted.push(row);
  }

  logger.info(
    { exchangerId, accountIndex, count: inserted.length },
    'Deposit addresses provisioned',
  );
  return inserted;
}

/**
 * Fetches all deposit addresses for an exchanger.
 */
export async function getAddresses(exchangerId: string): Promise<DbDepositAddress[]> {
  return db<DbDepositAddress[]>`
    SELECT * FROM deposit_addresses WHERE exchanger_id = ${exchangerId} ORDER BY asset
  `;
}

/**
 * Looks up an exchanger by a deposit address string.
 * Used when a webhook arrives to identify who to credit.
 */
export async function findExchangerByAddress(
  address: string,
): Promise<{ exchangerId: string; asset: Asset; chain: Chain; derivationPath: string } | null> {
  const rows = await db<{ exchanger_id: string; asset: string; chain: string; derivation_path: string }[]>`
    SELECT exchanger_id, asset, chain, derivation_path
    FROM deposit_addresses
    WHERE address = ${address}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    exchangerId: r.exchanger_id,
    asset: r.asset as Asset,
    chain: r.chain as Chain,
    derivationPath: r.derivation_path,
  };
}

/**
 * Gets the derivation path for a specific exchanger + asset combo.
 * Used by the TX engine when signing a send.
 */
export async function getDerivationPath(
  exchangerId: string,
  asset: Asset,
): Promise<string | null> {
  const rows = await db<{ derivation_path: string }[]>`
    SELECT derivation_path FROM deposit_addresses
    WHERE exchanger_id = ${exchangerId} AND asset = ${asset}
    LIMIT 1
  `;
  return rows[0]?.derivation_path ?? null;
}
