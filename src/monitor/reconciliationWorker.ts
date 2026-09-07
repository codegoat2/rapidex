/**
 * Reconciliation Worker
 *
 * Runs on a cron schedule to catch any deposits that were missed
 * by webhooks (provider downtime, missed delivery, etc.).
 *
 * Strategy per chain:
 *   BTC/LTC  — BlockCypher address endpoint (lists all txs)
 *   ETH/ERC20 — Alchemy getAssetTransfers
 *   SOL/SPL   — Helius getAddressTransactions
 *
 * For each deposit address:
 *   - Fetch recent transactions from the chain
 *   - For each tx not already in webhook_events → inject as RECONCILIATION event
 *   - processDeposit handles the rest (idempotency, ledger credit, notify)
 */

import cron from 'node-cron';
import axios from 'axios';
import { db } from '../db/client';
import { logger } from '../utils/logger';
import { config } from '../config/env';
import { processDeposit } from './depositProcessor';
import type { Asset } from '../types';

const log = logger.child({ worker: 'reconciliation' });

// ---------------------------------------------------------------------------
// Cron schedule — every 10 minutes
// ---------------------------------------------------------------------------

export function startReconciliationWorker(): void {
  log.info('Reconciliation worker starting (every 10 minutes)');

  cron.schedule('*/10 * * * *', () => {
    void runReconciliation().catch((err) =>
      log.error({ err }, 'Reconciliation worker error'),
    );
  });
}

async function runReconciliation(): Promise<void> {
  log.debug('Reconciliation run starting');

  // Get all deposit addresses
  const addresses = await db<{
    address: string;
    asset: string;
    chain: string;
    exchanger_id: string;
  }[]>`
    SELECT da.address, da.asset, da.chain, da.exchanger_id
    FROM deposit_addresses da
    JOIN exchangers e ON e.id = da.exchanger_id
    WHERE e.is_active = TRUE AND e.is_banned = FALSE
  `;

  for (const addr of addresses) {
    try {
      await reconcileAddress(addr.address, addr.asset as Asset, addr.chain, addr.exchanger_id);
    } catch (err) {
      log.warn({ err, address: addr.address }, 'Failed to reconcile address');
    }
  }

  log.debug('Reconciliation run complete');
}

async function reconcileAddress(
  address: string,
  asset: Asset,
  chain: string,
  exchangerId: string,
): Promise<void> {
  let txIds: string[] = [];

  if (chain === 'bitcoin' || chain === 'litecoin') {
    txIds = await fetchBlockcypherTxIds(address, chain);
  } else if (chain === 'ethereum') {
    txIds = await fetchAlchemyTxIds(address, asset);
  } else if (chain === 'solana') {
    txIds = await fetchHeliusTxIds(address);
  }

  for (const txId of txIds) {
    // Check if already processed
    const processed = await db<{ id: string }[]>`
      SELECT id FROM webhook_events
      WHERE event_id = ${txId}
        AND processed = TRUE
      LIMIT 1
    `;
    if (processed.length > 0) continue;

    log.info({ txId, address, asset }, 'Reconciliation: injecting missed deposit');

    const amount = await fetchTxAmount(txId, address, asset, chain);
    if (!amount || Number(amount) <= 0) continue;

    await processDeposit({
      provider: 'RECONCILIATION',
      eventId: txId,
      rawPayload: {
        txId,
        address,
        amount,
        asset,
        confirmations: 3, // already confirmed if showing in history
        exchangerId,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Chain-specific TX fetchers
// ---------------------------------------------------------------------------

async function fetchBlockcypherTxIds(address: string, chain: string): Promise<string[]> {
  const coinPath = chain === 'litecoin' ? 'ltc/main' : 'btc/main';
  const url = `https://api.blockcypher.com/v1/${coinPath}/addrs/${address}/full?limit=20&token=${config.BLOCKCYPHER_TOKEN}`;

  try {
    const res = await axios.get<{ txs?: Array<{ hash: string }> }>(url, { timeout: 10000 });
    return (res.data.txs ?? []).map((tx) => tx.hash);
  } catch {
    return [];
  }
}

async function fetchAlchemyTxIds(address: string, asset: Asset): Promise<string[]> {
  const network = config.NETWORK === 'testnet' ? 'eth-sepolia' : 'eth-mainnet';
  const url = `https://${network}.g.alchemy.com/v2/${config.ALCHEMY_API_KEY}`;

  const category = asset === 'ETH' ? ['external'] : ['erc20'];

  try {
    const res = await axios.post<{
      result?: { transfers: Array<{ hash: string }> };
    }>(
      url,
      {
        id: 1,
        jsonrpc: '2.0',
        method: 'alchemy_getAssetTransfers',
        params: [{
          toAddress: address,
          category,
          withMetadata: false,
          maxCount: '0x14', // 20
        }],
      },
      { timeout: 10000 },
    );
    return (res.data.result?.transfers ?? []).map((t) => t.hash);
  } catch {
    return [];
  }
}

async function fetchHeliusTxIds(address: string): Promise<string[]> {
  const cluster = config.NETWORK === 'testnet' ? 'devnet' : 'mainnet';
  const url = `https://${cluster}.helius-rpc.com/?api-key=${config.HELIUS_API_KEY}`;

  try {
    const res = await axios.post<Array<{ signature: string }>>(
      url,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [address, { limit: 20 }],
      },
      { timeout: 10000 },
    );
    return Array.isArray(res.data) ? res.data.map((r) => r.signature) : [];
  } catch {
    return [];
  }
}

async function fetchTxAmount(
  txId: string,
  address: string,
  asset: Asset,
  chain: string,
): Promise<string | null> {
  // Simplified — in production each chain has its own TX detail fetcher.
  // Returns the amount received at `address` for this specific tx.
  try {
    if (chain === 'bitcoin' || chain === 'litecoin') {
      const coinPath = chain === 'litecoin' ? 'ltc/main' : 'btc/main';
      const url = `https://api.blockcypher.com/v1/${coinPath}/txs/${txId}?token=${config.BLOCKCYPHER_TOKEN}`;
      const res = await axios.get<{ outputs: Array<{ addresses: string[]; value: number }> }>(
        url,
        { timeout: 10000 },
      );
      const out = res.data.outputs?.find((o) => o.addresses?.includes(address));
      if (!out) return null;
      return (out.value / 1e8).toFixed(18);
    }
    // ETH/SOL amounts are available from the original tx detail — placeholder
    return null;
  } catch {
    return null;
  }
}
