/**
 * Deposit Processor
 *
 * Handles the business logic after a raw webhook event arrives:
 *   1. Idempotency gate — skip if already processed
 *   2. Record raw event in webhook_events
 *   3. Parse provider-specific payload to extract address + amount + asset
 *   4. Look up exchanger by deposit address
 *   5. Call ledger service to credit
 *   6. Notify exchanger via Discord
 *   7. Mark webhook_event processed
 */

import { db } from '../db/client';
import { logger } from '../utils/logger';
import { findExchangerByAddress } from '../wallet/addressService';
import { recordDeposit } from '../ledger/ledgerService';
import { depositKey } from '../security/idempotency';
import type { Asset, WebhookProvider } from '../types';

export interface WebhookInput {
  provider: WebhookProvider;
  eventId:  string;
  rawPayload: Record<string, unknown>;
}

/**
 * Entry point for all incoming deposit events.
 * Notification to Discord is handled by the notification service (Task 12)
 * which is imported lazily to avoid circular deps at startup.
 */
export async function processDeposit(input: WebhookInput): Promise<void> {
  const { provider, eventId, rawPayload } = input;
  const log = logger.child({ provider, eventId });

  // ------------------------------------------------------------------
  // 1. Idempotency gate
  // ------------------------------------------------------------------
  const existing = await db<{ processed: boolean; id: string }[]>`
    SELECT id, processed FROM webhook_events
    WHERE provider = ${provider}
      AND event_id = ${eventId}
    LIMIT 1
  `;

  if (existing.length > 0 && existing[0].processed) {
    log.debug('Webhook already processed — skipping');
    return;
  }

  // ------------------------------------------------------------------
  // 2. Record raw event (upsert so duplicates don't error)
  // ------------------------------------------------------------------
  const [webhookRow] = await db<{ id: string }[]>`
    INSERT INTO webhook_events (provider, event_id, raw_payload)
    VALUES (${provider}, ${eventId}, ${rawPayload as unknown as string})
    ON CONFLICT (provider, event_id) DO UPDATE
      SET raw_payload = EXCLUDED.raw_payload
    RETURNING id
  `;
  const webhookId = webhookRow.id;

  // ------------------------------------------------------------------
  // 3. Parse provider payload
  // ------------------------------------------------------------------
  let deposits: ParsedDeposit[];
  try {
    deposits = parsePayload(provider, rawPayload);
  } catch (err) {
    log.error({ err }, 'Failed to parse deposit payload');
    await markFailed(webhookId, String(err));
    return;
  }

  if (deposits.length === 0) {
    log.debug('No actionable deposits in payload');
    await markProcessed(webhookId);
    return;
  }

  // ------------------------------------------------------------------
  // 4-6. For each deposit: find exchanger → credit ledger → notify
  // ------------------------------------------------------------------
  for (const deposit of deposits) {
    try {
      await creditDeposit(deposit, log);
    } catch (err) {
      log.error({ err, deposit }, 'Failed to credit deposit');
      await markFailed(webhookId, String(err));
      return;
    }
  }

  await markProcessed(webhookId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedDeposit {
  txId:    string;
  address: string;
  amount:  string; // decimal string
  asset:   Asset;
  confirmations: number;
}

function parsePayload(provider: WebhookProvider, payload: Record<string, unknown>): ParsedDeposit[] {
  switch (provider) {
    case 'BLOCKCYPHER': return parseBlockcypher(payload);
    case 'ALCHEMY':     return parseAlchemy(payload);
    case 'HELIUS':      return parseHelius(payload);
    case 'RECONCILIATION': return parseReconciliation(payload);
    default:            return [];
  }
}

function parseBlockcypher(payload: Record<string, unknown>): ParsedDeposit[] {
  // BlockCypher tx webhook payload
  const txHash = String(payload['hash'] ?? '');
  const outputs = (payload['outputs'] as Array<Record<string, unknown>> | undefined) ?? [];
  const confirmations = Number(payload['confirmations'] ?? 0);

  // Detect coin from payload (BlockCypher includes 'chain' field)
  const chain = String(payload['chain'] ?? '').toLowerCase();
  const asset: Asset = chain.includes('ltc') ? 'LTC' : 'BTC';

  return outputs.map((out) => {
    const addresses = (out['addresses'] as string[] | undefined) ?? [];
    const value = Number(out['value'] ?? 0); // satoshis
    const satoshiAmount = (value / 1e8).toFixed(18);

    return addresses.map((address) => ({
      txId: txHash,
      address,
      amount: satoshiAmount,
      asset,
      confirmations,
    }));
  }).flat().filter((d) => Number(d.amount) > 0);
}

function parseAlchemy(payload: Record<string, unknown>): ParsedDeposit[] {
  // Alchemy Address Activity webhook
  const event = (payload['event'] as Record<string, unknown> | undefined) ?? {};
  const activity = (event['activity'] as Array<Record<string, unknown>> | undefined) ?? [];

  return activity
    .filter((act) => act['category'] === 'token' || act['category'] === 'external')
    .map((act) => {
      const toAddress = String(act['toAddress'] ?? '');
      const value = String(act['value'] ?? '0');
      const asset = act['asset'] as string;
      const txHash = String(act['hash'] ?? '');

      let mappedAsset: Asset;
      if (asset === 'ETH') {
        mappedAsset = 'ETH';
      } else if (asset === 'USDT') {
        mappedAsset = 'USDT_ERC20';
      } else if (asset === 'USDC') {
        mappedAsset = 'USDC_ERC20';
      } else {
        return null;
      }

      return {
        txId: txHash,
        address: toAddress.toLowerCase(),
        amount: value,
        asset: mappedAsset,
        confirmations: 1,
      };
    })
    .filter((d): d is ParsedDeposit => d !== null && Number(d.amount) > 0);
}

function parseHelius(payload: Record<string, unknown>): ParsedDeposit[] {
  // Helius Enhanced Transaction webhook
  const signature = String(payload['signature'] ?? '');
  const tokenTransfers = (payload['tokenTransfers'] as Array<Record<string, unknown>> | undefined) ?? [];
  const nativeTransfers = (payload['nativeTransfers'] as Array<Record<string, unknown>> | undefined) ?? [];

  const deposits: ParsedDeposit[] = [];

  for (const transfer of tokenTransfers) {
    const mint = String(transfer['mint'] ?? '');
    const toAddress = String(transfer['toUserAccount'] ?? '');
    const tokenAmount = String(transfer['tokenAmount'] ?? '0');

    // USDC SPL mint address (mainnet)
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    if (mint !== USDC_MINT) continue;

    deposits.push({
      txId: signature,
      address: toAddress,
      amount: tokenAmount,
      asset: 'USDC_SPL',
      confirmations: 1,
    });
  }

  // Native SOL transfers (if SOL is ever supported as a trade asset)
  for (const transfer of nativeTransfers) {
    const toAddress = String(transfer['toUserAccount'] ?? '');
    const amount = Number(transfer['amount'] ?? 0) / 1e9; // lamports to SOL
    if (amount > 0) {
      // SOL not in current asset list but here for extensibility
      void toAddress;
    }
  }

  return deposits.filter((d) => Number(d.amount) > 0);
}

function parseReconciliation(payload: Record<string, unknown>): ParsedDeposit[] {
  // Internal format from reconciliation worker
  return [{
    txId:          String(payload['txId'] ?? ''),
    address:       String(payload['address'] ?? ''),
    amount:        String(payload['amount'] ?? '0'),
    asset:         payload['asset'] as Asset,
    confirmations: Number(payload['confirmations'] ?? 1),
  }];
}

async function creditDeposit(
  deposit: ParsedDeposit,
  log: ReturnType<typeof logger.child>,
): Promise<void> {
  const { txId, address, amount, asset, confirmations } = deposit;

  // Minimum confirmations gate
  const MIN_CONFIRMATIONS = 1;
  if (confirmations < MIN_CONFIRMATIONS) {
    log.debug({ confirmations, txId }, 'Deposit below min confirmations — skipping');
    return;
  }

  // Find exchanger by address
  const match = await findExchangerByAddress(address);
  if (!match) {
    log.debug({ address }, 'No exchanger found for deposit address — not ours');
    return;
  }

  const idempotencyKey = depositKey(txId, asset, match.exchangerId);

  await recordDeposit({
    exchangerId:    match.exchangerId,
    asset,
    amount,
    reference:      `On-chain deposit tx ${txId}`,
    idempotencyKey,
  });

  log.info({ exchangerId: match.exchangerId, asset, amount, txId }, 'Deposit credited');

  // Notify exchanger via Discord — lazy import to avoid circular dep
  try {
    const { notifyDepositCredited } = await import('../notifications/notificationService');
    await notifyDepositCredited(match.exchangerId, asset, amount, txId);
  } catch (err) {
    log.warn({ err }, 'Failed to send deposit notification — non-fatal');
  }
}

async function markProcessed(webhookId: string): Promise<void> {
  await db`
    UPDATE webhook_events
    SET processed = TRUE, processed_at = NOW()
    WHERE id = ${webhookId}
  `;
}

async function markFailed(webhookId: string, error: string): Promise<void> {
  await db`
    UPDATE webhook_events
    SET error = ${error}
    WHERE id = ${webhookId}
  `;
}
