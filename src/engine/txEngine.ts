/**
 * On-Chain Transaction Engine — NOWNodes provider
 *
 * BTC/LTC: NOWNodes Blockbook REST API (UTXO + broadcast)
 * ETH/ERC-20: NOWNodes ETH JSON-RPC + ethers.js
 * SOL/SPL: NOWNodes Solana JSON-RPC + @solana/web3.js
 */

import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { ethers } from 'ethers';
import {
  Connection, PublicKey, Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getMint,
} from '@solana/spl-token';
import { config } from '../config/env';
import { rpcUrl, blockbookUrl, blockbookHeaders, ERC20_CONTRACTS, USDC_MINT } from '../config/nownodes';
import { logger } from '../utils/logger';
import { rederivePrivateKey, rederiveSolKeypair } from '../wallet/hdWallet';
import { getDerivationPath } from '../wallet/addressService';
import { recordWithdrawal } from '../ledger/ledgerService';
import { recordFee } from '../ledger/ledgerService';
import { feeKey, withdrawalKey } from '../security/idempotency';
import { db } from '../db/client';
import { getTradeById, transitionTrade } from './tradeService';
import type { DbTrade, Asset } from '../types';

const ECPair = ECPairFactory(ecc);

// ---------------------------------------------------------------------------
// Explorer links
// ---------------------------------------------------------------------------

function explorerLink(asset: Asset, txId: string): string {
  const t = config.NETWORK === 'testnet';
  switch (asset) {
    case 'BTC':        return t ? `https://live.blockcypher.com/btc-testnet/tx/${txId}/` : `https://blockstream.info/tx/${txId}`;
    case 'LTC':        return `https://blockchair.com/litecoin/transaction/${txId}`;
    import { queueWithdrawal } from '../withdrawal/withdrawalService';
    case 'ETH':
    case 'USDT_ERC20':
    case 'USDC_ERC20': return t ? `https://sepolia.etherscan.io/tx/${txId}` : `https://etherscan.io/tx/${txId}`;
    case 'USDC_SPL':   return t ? `https://explorer.solana.com/tx/${txId}?cluster=devnet` : `https://solscan.io/tx/${txId}`;
    default:           return txId;
      processNow = false,
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function sendTradePayment(
  trade: DbTrade,
  exchangerId: string,
  adminDiscordId?: string,
): Promise<void> {
  const currentTrade = await getTradeById(trade.id);
  if (!currentTrade) throw new Error(`Trade ${trade.id} not found`);
  if (currentTrade.status === 'CRYPTO_SENT' || currentTrade.status === 'COMPLETED') return;
  if (currentTrade.status !== 'RELEASE_PENDING') {
    throw new Error(`Trade ${trade.id} cannot be paid from status ${currentTrade.status}`);
  }
  trade = currentTrade;

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
    case 'USDT_ERC20':
    case 'USDC_ERC20': txId = await sendErc20(trade, derivationPath);              break;
    case 'USDC_SPL':   txId = await sendSplUsdc(trade, derivationPath);            break;
    default:           throw new Error(`Unsupported asset: ${String(trade.asset)}`);
  }

  log.info({ txId }, 'TX broadcast');

  await recordWithdrawal({
    exchangerId, tradeId: trade.id, asset: trade.asset,
    amount: trade.amount, txId,
    idempotencyKey: withdrawalKey(trade.id, txId),
  });

  const [feeConfig] = await db<{ fee_percentage: string; min_fee_amount: string }[]>`
    SELECT fee_percentage, min_fee_amount FROM fee_config WHERE asset = ${trade.asset}
  `;
  if (feeConfig) {
    const feeAmount = calculateFee(trade.amount, feeConfig.fee_percentage, feeConfig.min_fee_amount);
    if (feeAmount !== '0') {
      await recordFee({
        exchangerId, tradeId: trade.id, asset: trade.asset, amount: feeAmount,
        idempotencyKey: feeKey(trade.id),
      });
    }
  }

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
  const feePerKb    = parseFloat(feeRes.data.result ?? '0.0002') * 1e8;
  const feePerByte  = Math.ceil(feePerKb / 1024);

  // Build PSBT
  const psbt = new bitcoin.Psbt({ network });
  let inputTotal = 0;

  for (const utxo of utxos) {
    // Fetch raw tx hex for witness UTXO
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
    void txRes; // hex not needed for segwit inputs
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
  const provider  = new ethers.JsonRpcProvider(rpcUrl('eth'));
  const privateKey = rederivePrivateKey(derivationPath);
  const wallet    = new ethers.Wallet(privateKey.toString('hex'), provider);
  const value     = ethers.parseEther(trade.amount);
  const feeData   = await provider.getFeeData();

  const tx = await wallet.sendTransaction({
    to: trade.user_wallet_address!,
    value,
    maxFeePerGas:         feeData.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  });
  return tx.hash;
}

// ---------------------------------------------------------------------------
// ERC-20 (USDT / USDC) — NOWNodes JSON-RPC + ethers.js
// ---------------------------------------------------------------------------

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

async function sendErc20(trade: DbTrade, derivationPath: string): Promise<string> {
  const netKey    = config.NETWORK === 'testnet' ? 'testnet' : 'mainnet';
  const provider  = new ethers.JsonRpcProvider(rpcUrl('eth'));
  const privateKey = rederivePrivateKey(derivationPath);
  const wallet    = new ethers.Wallet(privateKey.toString('hex'), provider);

  const contractAddress = ERC20_CONTRACTS[trade.asset]?.[netKey];
  if (!contractAddress) throw new Error(`No ERC-20 contract for ${trade.asset} on ${netKey}`);

  const contract = new ethers.Contract(contractAddress, ERC20_ABI, wallet);
  const decimals = await contract.decimals() as bigint;
  const amount   = ethers.parseUnits(trade.amount, decimals);

  const tx = await (contract.transfer(trade.user_wallet_address!, amount) as Promise<ethers.ContractTransactionResponse>);
  return tx.hash;
}

// ---------------------------------------------------------------------------
// SOL/SPL USDC — NOWNodes Solana RPC + @solana/web3.js
// ---------------------------------------------------------------------------

async function sendSplUsdc(trade: DbTrade, derivationPath: string): Promise<string> {
  const testnet    = config.NETWORK === 'testnet';
  const connection = new Connection(rpcUrl('sol'), 'confirmed');
  const keypair    = rederiveSolKeypair(derivationPath);
  const mintAddr   = testnet ? USDC_MINT.testnet : USDC_MINT.mainnet;
  const mint       = new PublicKey(mintAddr);
  const mintInfo   = await getMint(connection, mint);
  const amount     = BigInt(Math.round(parseFloat(trade.amount) * 10 ** mintInfo.decimals));

  const fromAta = await getOrCreateAssociatedTokenAccount(connection, keypair, mint, keypair.publicKey);
  const toAta   = await getOrCreateAssociatedTokenAccount(connection, keypair, mint, new PublicKey(trade.user_wallet_address!));

  const tx  = new Transaction().add(
    createTransferInstruction(fromAta.address, toAta.address, keypair.publicKey, amount),
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
  return sig;
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
  return config.TIMEOUT_CRYPTO_SENT_CONFIRMATIONS; // ETH/SOL confirmed after broadcast
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
  const amountUnits = ethers.parseUnits(amount, 18);
  const percentageUnits = ethers.parseUnits(percentage, 4);
  const minimumUnits = ethers.parseUnits(minimum, 18);
  const feeUnits = amountUnits * percentageUnits / (100n * 10_000n);
  const result = feeUnits > minimumUnits ? feeUnits : minimumUnits;
  return ethers.formatUnits(result, 18);
}
