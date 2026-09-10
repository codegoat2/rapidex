/**
 * On-Chain Transaction Engine — NOWNodes provider
 *
 * BTC/LTC: NOWNodes Blockbook REST API (UTXO + broadcast)
 * ETH:     NOWNodes ETH JSON-RPC + ethers.js
 * SOL:     NOWNodes Solana JSON-RPC + @solana/web3.js
 * BNB:     NOWNodes BSC JSON-RPC + ethers.js  (native send)
 * USDT_BEP20: NOWNodes BSC JSON-RPC + ethers.js (BEP-20 transfer)
 *
 * Supported tradeable assets: BTC, LTC, ETH, SOL, USDT_BEP20
 * BNB is also supported as a direct tradeable asset.
 */

import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { ethers } from 'ethers';
import {
  Connection, PublicKey, Transaction,
  SystemProgram, LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { config } from '../config/env';
import { rpcUrl, blockbookUrl, blockbookHeaders, BEP20_CONTRACTS } from '../config/nownodes';
import { logger } from '../utils/logger';
import { rederivePrivateKey, rederiveSolKeypair } from '../wallet/hdWallet';
import { getDerivationPath } from '../wallet/addressService';
import { recordWithdrawal, settleTradeProfit } from '../ledger/ledgerService';
import { withdrawalKey } from '../security/idempotency';
import { db } from '../db/client';
import { getTradeById, transitionTrade } from './tradeService';
import type { DbTrade, Asset } from '../types';
import { queueWithdrawal } from '../withdrawal/withdrawalService';

const ECPair = ECPairFactory(ecc);

// ---------------------------------------------------------------------------
// Explorer links
// ---------------------------------------------------------------------------

function explorerLink(asset: Asset, txId: string): string {
  const t = config.NETWORK === 'testnet';
  switch (asset) {
    case 'BTC':
      return t
        ? `https://live.blockcypher.com/btc-testnet/tx/${txId}/`
        : `https://blockstream.info/tx/${txId}`;
    case 'LTC':
      return `https://blockchair.com/litecoin/transaction/${txId}`;
    case 'ETH':
      return t
        ? `https://sepolia.etherscan.io/tx/${txId}`
        : `https://etherscan.io/tx/${txId}`;
    case 'SOL':
      return t
        ? `https://explorer.solana.com/tx/${txId}?cluster=devnet`
        : `https://solscan.io/tx/${txId}`;
    case 'BNB':
    case 'USDT_BEP20':
      return t
        ? `https://testnet.bscscan.com/tx/${txId}`
        : `https://bscscan.com/tx/${txId}`;
    default:
      return txId;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function sendTradePayment(
  trade: DbTrade,
  exchangerId: string,
  adminDiscordId?: string,
  processNow = false,
): Promise<void> {
  const currentTrade = await getTradeById(trade.id);
  if (!currentTrade) throw new Error(`Trade ${trade.id} not found`);
  if (currentTrade.status === 'CRYPTO_SENT' || currentTrade.status === 'COMPLETED') return;
  if (currentTrade.status !== 'RELEASE_PENDING') {
    throw new Error(`Trade ${trade.id} cannot be paid from status ${currentTrade.status}`);
  }
  trade = currentTrade;

  if (!processNow) {
    if (!trade.user_wallet_address) throw new Error('No destination wallet address on trade');
    await queueWithdrawal({
      tradeId: trade.id,
      exchangerId,
      asset: trade.asset,
      amount: trade.amount,
      destination: trade.user_wallet_address,
    });
    return;
  }

  const log = logger.child({ tradeId: trade.id, asset: trade.asset });

  if (!trade.user_wallet_address) throw new Error('No destination wallet address on trade');

  const derivationPath = await getDerivationPath(exchangerId, trade.asset);
  if (!derivationPath) throw new Error(`No derivation path for ${trade.asset}`);

  log.info({ amount: trade.amount, to: trade.user_wallet_address }, 'Sending on-chain TX');

  let txId: string;
  switch (trade.asset) {
    case 'BTC':        txId = await sendBtcLtc(trade, derivationPath, 'bitcoin');  break;
    case 'LTC':        txId = await sendBtcLtc(trade, derivationPath, 'litecoin'); break;
    case 'ETH':        txId = await sendEth(trade, derivationPath);                break;
    case 'SOL':        txId = await sendSol(trade, derivationPath);                break;
    case 'BNB':        txId = await sendBnb(trade, derivationPath);                break;
    case 'USDT_BEP20': txId = await sendBep20(trade, derivationPath);              break;
    default:           throw new Error(`Unsupported asset: ${String(trade.asset)}`);
  }

  log.info({ txId }, 'TX broadcast');

  await recordWithdrawal({
    exchangerId, tradeId: trade.id, asset: trade.asset,
    amount: trade.amount, txId,
    idempotencyKey: withdrawalKey(trade.id, txId),
  });

  const updated = await transitionTrade({
    tradeId: trade.id, to: 'CRYPTO_SENT',
    actorDiscordId: adminDiscordId ?? 'SYSTEM',
    note: `TX broadcast: ${txId}`, updates: { txId },
  });

  try {
    const { notifyCryptoSent } = await import('../notifications/notificationService');
    await notifyCryptoSent(trade.id, txId, explorerLink(trade.asset, txId));
  } catch { /* non-fatal */ }

  void waitForConfirmations(updated, exchangerId, txId);
}

/** Sends a standalone exchanger withdrawal that has already reserved balance. */
export async function sendExchangerWithdrawal(params: {
  withdrawalId: string;
  exchangerId: string;
  asset: Asset;
  amount: string;
  destination: string;
}): Promise<string> {
  const derivationPath = await getDerivationPath(params.exchangerId, params.asset);
  if (!derivationPath) throw new Error(`No derivation path for ${params.asset}`);

  const payment = {
    id: params.withdrawalId,
    asset: params.asset,
    amount: params.amount,
    user_wallet_address: params.destination,
  } as DbTrade;

  switch (params.asset) {
    case 'BTC':        return sendBtcLtc(payment, derivationPath, 'bitcoin');
    case 'LTC':        return sendBtcLtc(payment, derivationPath, 'litecoin');
    case 'ETH':        return sendEth(payment, derivationPath);
    case 'SOL':        return sendSol(payment, derivationPath);
    case 'BNB':        return sendBnb(payment, derivationPath);
    case 'USDT_BEP20': return sendBep20(payment, derivationPath);
    default:           throw new Error(`Unsupported asset: ${String(params.asset)}`);
  }
}

// ---------------------------------------------------------------------------
// BTC / LTC — NOWNodes Blockbook
// ---------------------------------------------------------------------------

async function sendBtcLtc(
  trade: DbTrade,
  derivationPath: string,
  chain: 'bitcoin' | 'litecoin',
): Promise<string> {
  const testnet    = config.NETWORK === 'testnet';
  const network    = getBitcoinNetwork(chain, testnet);
  const bbUrl      = blockbookUrl(chain === 'bitcoin' ? 'btc' : 'ltc');
  const headers    = blockbookHeaders();
  const privateKey = rederivePrivateKey(derivationPath);
  const keyPair    = ECPair.fromPrivateKey(privateKey, { network });

  const fromAddress = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey), network,
  }).address!;

  // Fetch UTXOs via Blockbook
  const utxoRes = await axios.get<Array<{ txid: string; vout: number; value: string; confirmations: number }>>(
    `${bbUrl}/utxo/${fromAddress}`, { headers, timeout: 15000 },
  );
  const utxos = utxoRes.data ?? [];
  if (utxos.length === 0) throw new Error(`No UTXOs for ${fromAddress}`);

  // Estimate fee via Blockbook
  const feeRes = await axios.get<{ result: string }>(
    `${bbUrl}/estimatefee/3`, { headers, timeout: 10000 },
  );
  const feePerKb   = parseFloat(feeRes.data.result ?? '0.0002') * 1e8;
  const feePerByte = Math.ceil(feePerKb / 1024);

  // Build PSBT
  const psbt = new bitcoin.Psbt({ network });
  let inputTotal = 0;

  for (const utxo of utxos) {
    const txRes = await axios.get<{ hex: string }>(
      `${bbUrl}/tx-specific/${utxo.txid}`, { headers, timeout: 10000 },
    );
    psbt.addInput({
      hash: utxo.txid, index: utxo.vout,
      witnessUtxo: {
        script: bitcoin.payments.p2wpkh({ pubkey: Buffer.from(keyPair.publicKey), network }).output!,
        value: parseInt(utxo.value, 10),
      },
    });
    inputTotal += parseInt(utxo.value, 10);
    void txRes;
  }

  const sendSatoshis  = Math.round(parseFloat(trade.amount) * 1e8);
  const estimatedSize = utxos.length * 68 + 2 * 31 + 10;
  const fee           = estimatedSize * feePerByte;
  const change        = inputTotal - sendSatoshis - fee;

  if (change < 0) throw new Error(`Insufficient UTXOs: have ${inputTotal}, need ${sendSatoshis + fee}`);

  psbt.addOutput({ address: trade.user_wallet_address!, value: sendSatoshis });
  if (change > 546) psbt.addOutput({ address: fromAddress, value: change });

  psbt.signAllInputs(keyPair);
  psbt.finalizeAllInputs();
  const rawHex = psbt.extractTransaction().toHex();

  // Broadcast via Blockbook
  const broadcastRes = await axios.post<{ result: string }>(
    `${bbUrl}/sendtx/`, rawHex,
    { headers: { ...headers, 'Content-Type': 'text/plain' }, timeout: 15000 },
  );
  return broadcastRes.data.result;
}

// ---------------------------------------------------------------------------
// ETH — NOWNodes JSON-RPC + ethers.js
// ---------------------------------------------------------------------------

async function sendEth(trade: DbTrade, derivationPath: string): Promise<string> {
  const provider   = new ethers.JsonRpcProvider(rpcUrl('eth'));
  const privateKey = rederivePrivateKey(derivationPath);
  const wallet     = new ethers.Wallet(privateKey.toString('hex'), provider);
  const value      = ethers.parseEther(trade.amount);
  const feeData    = await provider.getFeeData();

  const tx = await wallet.sendTransaction({
    to:                   trade.user_wallet_address!,
    value,
    maxFeePerGas:         feeData.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  });
  return tx.hash;
}

// ---------------------------------------------------------------------------
// SOL — NOWNodes Solana JSON-RPC + @solana/web3.js (native SOL transfer)
// ---------------------------------------------------------------------------

async function sendSol(trade: DbTrade, derivationPath: string): Promise<string> {
  const connection = new Connection(rpcUrl('sol'), 'confirmed');
  const keypair    = rederiveSolKeypair(derivationPath);
  const lamports   = Math.round(parseFloat(trade.amount) * LAMPORTS_PER_SOL);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey:   new PublicKey(trade.user_wallet_address!),
      lamports,
    }),
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
  return sig;
}

// ---------------------------------------------------------------------------
// BNB — NOWNodes BSC JSON-RPC + ethers.js (native BNB transfer)
// ---------------------------------------------------------------------------

async function sendBnb(trade: DbTrade, derivationPath: string): Promise<string> {
  const provider   = new ethers.JsonRpcProvider(rpcUrl('bnb'));
  const privateKey = rederivePrivateKey(derivationPath);
  const wallet     = new ethers.Wallet(privateKey.toString('hex'), provider);
  const value      = ethers.parseEther(trade.amount);
  const feeData    = await provider.getFeeData();

  const tx = await wallet.sendTransaction({
    to:                   trade.user_wallet_address!,
    value,
    maxFeePerGas:         feeData.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  });
  return tx.hash;
}

// ---------------------------------------------------------------------------
// USDT BEP-20 — NOWNodes BSC JSON-RPC + ethers.js
// ---------------------------------------------------------------------------

const BEP20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

async function sendBep20(trade: DbTrade, derivationPath: string): Promise<string> {
  const netKey    = config.NETWORK === 'testnet' ? 'testnet' : 'mainnet';
  const provider  = new ethers.JsonRpcProvider(rpcUrl('bnb'));
  const privateKey = rederivePrivateKey(derivationPath);
  const wallet    = new ethers.Wallet(privateKey.toString('hex'), provider);

  const contractAddress = BEP20_CONTRACTS[trade.asset]?.[netKey];
  if (!contractAddress) throw new Error(`No BEP-20 contract for ${trade.asset} on ${netKey}`);

  const contract = new ethers.Contract(contractAddress, BEP20_ABI, wallet);
  const decimals = await contract.decimals() as bigint;
  const amount   = ethers.parseUnits(trade.amount, decimals);

  const tx = await (contract.transfer(trade.user_wallet_address!, amount) as Promise<ethers.ContractTransactionResponse>);
  return tx.hash;
}

// ---------------------------------------------------------------------------
// Confirmation tracking
// ---------------------------------------------------------------------------

async function waitForConfirmations(trade: DbTrade, _exchangerId: string, txId: string): Promise<void> {
  const required = config.TIMEOUT_CRYPTO_SENT_CONFIRMATIONS;
  const log      = logger.child({ tradeId: trade.id, txId });
  const max      = 240;
  let attempts   = 0;

  while (attempts < max) {
    await sleep(30_000);
    attempts++;
    try {
      const confs = await getConfirmations(trade.asset, txId);
      log.debug({ confs, required }, 'Checking confirmations');
      if (confs >= required) {
        await transitionTrade({
          tradeId: trade.id, to: 'COMPLETED',
          actorDiscordId: 'SYSTEM',
          note: `${confs} confirmations received`,
          updates: { completedAt: new Date() },
        });
        await settleTradeProfit(trade.id);
        await db`
          UPDATE withdrawals
          SET status = 'CONFIRMED', tx_id = ${txId}, updated_at = NOW()
          WHERE trade_id = ${trade.id} AND status IN ('BROADCAST', 'PROCESSING')
        `;
        try {
          const { notifyTradeCompleted } = await import('../notifications/notificationService');
          await notifyTradeCompleted(trade.id);
        } catch { /* non-fatal */ }
        log.info('Trade completed');
        return;
      }
    } catch (err) {
      log.warn({ err }, 'Confirmation check failed — retrying');
    }
  }

  log.error('Confirmation timeout');
  try {
    const { sendAdminAlert } = await import('../notifications/notificationService');
    await sendAdminAlert(`⚠️ Confirmation timeout trade \`${trade.id}\` TX \`${txId}\``);
  } catch { /* non-fatal */ }
}

async function getConfirmations(asset: Asset, txId: string): Promise<number> {
  if (asset === 'BTC' || asset === 'LTC') {
    const chain = asset === 'LTC' ? 'ltc' : 'btc';
    const res = await axios.get<{ confirmations?: number }>(
      `${blockbookUrl(chain)}/tx/${txId}`,
      { headers: blockbookHeaders(), timeout: 10000 },
    );
    return res.data.confirmations ?? 0;
  }
  // ETH, SOL, BNB, USDT_BEP20 — considered confirmed once broadcast
  return config.TIMEOUT_CRYPTO_SENT_CONFIRMATIONS;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBitcoinNetwork(chain: 'bitcoin' | 'litecoin', testnet: boolean): bitcoin.Network {
  if (chain === 'litecoin') {
    return testnet
      ? { messagePrefix: '\x19Litecoin Signed Message:\n', bech32: 'tltc', bip32: { public: 0x0436f6e1, private: 0x0436ef7d }, pubKeyHash: 0x6f, scriptHash: 0x3a, wif: 0xef }
      : { messagePrefix: '\x19Litecoin Signed Message:\n', bech32: 'ltc',  bip32: { public: 0x019da462, private: 0x019d9cfe }, pubKeyHash: 0x30, scriptHash: 0x32, wif: 0xb0 };
  }
  return testnet ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

function calculateFee(amount: string, percentage: string, minimum: string): string {
  const amountUnits     = ethers.parseUnits(amount, 18);
  const percentageUnits = ethers.parseUnits(percentage, 4);
  const minimumUnits    = ethers.parseUnits(minimum, 18);
  const feeUnits        = amountUnits * percentageUnits / (100n * 10_000n);
  const result          = feeUnits > minimumUnits ? feeUnits : minimumUnits;
  return ethers.formatUnits(result, 18);
}
