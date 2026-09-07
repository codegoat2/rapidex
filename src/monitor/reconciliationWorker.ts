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
import { rpcUrl, blockbookUrl, blockbookHeaders, ERC20_CONTRACTS } from '../config/nownodes';
import { Connection, PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
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
  const url = `${blockbookUrl(chain === 'litecoin' ? 'ltc' : 'btc')}/addr/${address}/full?limit=20`;

  try {
    const res = await axios.get<{ txs?: Array<{ hash: string }> }>(url, { headers: blockbookHeaders(), timeout: 10000 });
    return (res.data.txs ?? []).map((tx) => tx.hash);
  } catch {
    return [];
  }
}

async function fetchAlchemyTxIds(address: string, asset: Asset): Promise<string[]> {
  const provider = new ethers.JsonRpcProvider(rpcUrl('eth'));

  try {
    if (asset === 'ETH') {
      const latest = await provider.send('eth_getBlockNumber', []);
      const blockNum = Number(latest);
      const fromBlock = `0x${Math.max(0, blockNum - 1000).toString(16)}`;
      const logs = await provider.send('eth_getLogs', [{
        fromBlock,
        toBlock: `0x${blockNum.toString(16)}`,
        topics: [],
      }]);
      return (logs as any[])
        .filter((log: any) => !log.address || log.address === '0x0000000000000000000000000000000000000000')
        .filter((log: any) => {
          const from = '0x' + (log.topics[1] || '').slice(26);
          const to = '0x' + (log.topics[2] || '').slice(26);
          return from.toLowerCase() === address.toLowerCase() || to.toLowerCase() === address.toLowerCase();
        })
        .map((log: any) => log.transactionHash)
        .filter((hash: string) => hash);
    }
    const topic = ethers.id('Transfer(address,address,uint256)').slice(2);
    const logs = await provider.send('eth_getLogs', [{
      fromBlock: '0x0',
      toBlock: 'latest',
      address: ERC20_CONTRACTS[asset === 'USDT_ERC20' ? 'USDT_ERC20' : 'USDC_ERC20']?.mainnet,
      topics: [topic, null, ethers.zeroPadValue(address, 32).slice(2)],
    }]);
    return (logs as any[]).map((log: any) => log.transactionHash).filter((hash: string) => hash);
  } catch {
    return [];
  }
}

async function fetchHeliusTxIds(address: string): Promise<string[]> {
  const connection = new Connection(rpcUrl('sol'), 'confirmed');

  try {
    const signatures = await connection.getSignaturesForAddress(new PublicKey(address), { limit: 20 });
    return signatures.map((s) => s.signature);
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
  try {
    if (chain === 'bitcoin' || chain === 'litecoin') {
      const url = `${blockbookUrl(chain === 'litecoin' ? 'ltc' : 'btc')}/tx/${txId}`;
      const res = await axios.get<{ outputs: Array<{ addresses: string[]; value: number }> }>(
        url,
        { headers: blockbookHeaders(), timeout: 10000 },
      );
      const out = res.data.outputs?.find((o) => o.addresses?.includes(address));
      if (!out) return null;
      return (out.value / 1e8).toFixed(18);
    }
    if (chain === 'ethereum') {
      const provider = new ethers.JsonRpcProvider(rpcUrl('eth'));
      const tx = await provider.getTransaction(txId);
      if (!tx) return null;
      const receipt = await provider.getTransactionReceipt(txId);
      if (!receipt) return null;
      if (asset === 'ETH') {
        const value = Number(tx.value) / 1e18;
        return value.toFixed(18);
      }
      const netKey = config.NETWORK === 'testnet' ? 'testnet' : 'mainnet';
      const contractAddress = ERC20_CONTRACTS[asset as 'USDT_ERC20' | 'USDC_ERC20']?.[netKey];
      if (!contractAddress) return null;
      const contract = new ethers.Contract(contractAddress, ['function decimals() view returns (uint8)'], provider);
      const decimals = await contract.decimals() as bigint;
      const transferInterface = new ethers.Interface([
        'event Transfer(address indexed from, address indexed to, uint256 value)',
      ]);
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
        try {
          const parsed = transferInterface.parseLog({ topics: [...log.topics], data: log.data });
          if (parsed?.name === 'Transfer' && String(parsed.args.to).toLowerCase() === address.toLowerCase()) {
            return ethers.formatUnits(parsed.args.value as bigint, decimals);
          }
        } catch {
          // Ignore unrelated logs in the same transaction.
        }
      }
      return null;
    }
    if (chain === 'solana') {
      const connection = new Connection(rpcUrl('sol'), 'confirmed');
      const tx = await connection.getTransaction(txId);
      if (!tx) return null;
      const preTokenBalances = tx.meta?.preTokenBalances ?? [];
      const postTokenBalances = tx.meta?.postTokenBalances ?? [];
      const tokenBalance = postTokenBalances.find((balance: any) => balance.owner === address);
      if (tokenBalance) {
        const before = preTokenBalances.find((balance: any) => balance.accountIndex === tokenBalance.accountIndex);
        const received = Number(tokenBalance.uiTokenAmount.uiAmountString) - Number(before?.uiTokenAmount.uiAmountString ?? '0');
        if (received > 0) return received.toFixed(18);
      }

      const accountIndex = tx.transaction.message.staticAccountKeys.findIndex((key: PublicKey) => key.toBase58() === address);
      if (accountIndex >= 0) {
        const received = (tx.meta?.postBalances?.[accountIndex] ?? 0) - (tx.meta?.preBalances?.[accountIndex] ?? 0);
        if (received > 0) return (received / 1e9).toFixed(18);
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}
