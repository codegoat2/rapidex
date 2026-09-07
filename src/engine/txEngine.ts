/**
 * On-Chain Transaction Engine
 *
 * Sends crypto from the exchanger's deposit address to the user's wallet.
 * Handles BTC, LTC (via BlockCypher), ETH/ERC-20 (via Alchemy/ethers.js),
 * SOL/SPL (via Helius/@solana/web3.js).
 *
 * After sending:
 *   1. Updates trade with tx_id → CRYPTO_SENT
 *   2. Writes WITHDRAWAL ledger entry
 *   3. Notifies Discord channel with explorer link
 *   4. Waits for confirmations → COMPLETED
 */

import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { ethers } from 'ethers';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getMint,
} from '@solana/spl-token';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { rederivePrivateKey, rederiveSolKeypair } from '../wallet/hdWallet';
import { getDerivationPath } from '../wallet/addressService';
import { recordWithdrawal } from '../ledger/ledgerService';
import { withdrawalKey } from '../security/idempotency';
import { transitionTrade } from './tradeService';
import type { DbTrade, Asset } from '../types';

const ECPair = ECPairFactory(ecc);

// ---------------------------------------------------------------------------
// Explorer link helpers
// ---------------------------------------------------------------------------

function explorerLink(asset: Asset, txId: string): string {
  const testnet = config.NETWORK === 'testnet';
  switch (asset) {
    case 'BTC':
      return testnet
        ? `https://live.blockcypher.com/btc-testnet/tx/${txId}/`
        : `https://blockstream.info/tx/${txId}`;
    case 'LTC':
      return testnet
        ? `https://live.blockcypher.com/ltc-testnet/tx/${txId}/`
        : `https://blockchair.com/litecoin/transaction/${txId}`;
    case 'ETH':
    case 'USDT_ERC20':
    case 'USDC_ERC20':
      return testnet
        ? `https://sepolia.etherscan.io/tx/${txId}`
        : `https://etherscan.io/tx/${txId}`;
    case 'USDC_SPL':
      return testnet
        ? `https://explorer.solana.com/tx/${txId}?cluster=devnet`
        : `https://solscan.io/tx/${txId}`;
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
): Promise<void> {
  const log = logger.child({ tradeId: trade.id, asset: trade.asset });

  if (!trade.user_wallet_address) {
    throw new Error('No destination wallet address on trade');
  }

  const derivationPath = await getDerivationPath(exchangerId, trade.asset);
  if (!derivationPath) throw new Error(`No derivation path for ${trade.asset}`);

  log.info({ amount: trade.amount, to: trade.user_wallet_address }, 'Sending on-chain TX');

  let txId: string;

  switch (trade.asset) {
    case 'BTC':
      txId = await sendBtcLtc(trade, derivationPath, 'bitcoin');
      break;
    case 'LTC':
      txId = await sendBtcLtc(trade, derivationPath, 'litecoin');
      break;
    case 'ETH':
      txId = await sendEth(trade, derivationPath);
      break;
    case 'USDT_ERC20':
    case 'USDC_ERC20':
      txId = await sendErc20(trade, derivationPath);
      break;
    case 'USDC_SPL':
      txId = await sendSplUsdc(trade, derivationPath);
      break;
    default:
      throw new Error(`Unsupported asset: ${String(trade.asset)}`);
  }

  log.info({ txId }, 'TX broadcast successfully');

  // Record withdrawal in ledger
  await recordWithdrawal({
    exchangerId,
    tradeId:        trade.id,
    asset:          trade.asset,
    amount:         trade.amount,
    txId,
    idempotencyKey: withdrawalKey(trade.id, txId),
  });

  // Transition → CRYPTO_SENT
  const updated = await transitionTrade({
    tradeId:        trade.id,
    to:             'CRYPTO_SENT',
    actorDiscordId: adminDiscordId ?? 'SYSTEM',
    note:           `TX broadcast: ${txId}`,
    updates:        { txId },
  });

  // Notify channel with TX link
  try {
    const { notifyCryptoSent } = await import('../notifications/notificationService');
    await notifyCryptoSent(trade.id, txId, explorerLink(trade.asset, txId));
  } catch { /* non-fatal */ }

  // Wait for confirmations then mark COMPLETED
  void waitForConfirmations(updated, exchangerId, txId);
}

// ---------------------------------------------------------------------------
// BTC / LTC send via BlockCypher
// ---------------------------------------------------------------------------

async function sendBtcLtc(
  trade: DbTrade,
  derivationPath: string,
  chain: 'bitcoin' | 'litecoin',
): Promise<string> {
  const testnet   = config.NETWORK === 'testnet';
  const coinPath  = chain === 'litecoin' ? (testnet ? 'ltc/test3' : 'ltc/main') : (testnet ? 'btc/test3' : 'btc/main');
  const network   = getBitcoinNetwork(chain, testnet);
  const privateKey = rederivePrivateKey(derivationPath);
  const keyPair   = ECPair.fromPrivateKey(privateKey, { network });

  const fromAddress = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network,
  }).address!;

  // Fetch UTXOs
  const utxoRes = await axios.get<{ txrefs?: Array<{ tx_hash: string; tx_output_n: number; value: number }> }>(
    `https://api.blockcypher.com/v1/${coinPath}/addrs/${fromAddress}?unspentOnly=true&token=${config.BLOCKCYPHER_TOKEN}`,
    { timeout: 15000 },
  );

  const utxos = utxoRes.data.txrefs ?? [];
  if (utxos.length === 0) throw new Error(`No UTXOs for ${fromAddress}`);

  // Estimate fee
  const feeRes = await axios.get<{ medium_fee_per_kb: number }>(
    `https://api.blockcypher.com/v1/${coinPath}`,
    { timeout: 10000 },
  );
  const feePerByte = Math.ceil((feeRes.data.medium_fee_per_kb ?? 20000) / 1024);

  // Build PSBT
  const psbt = new bitcoin.Psbt({ network });
  let inputTotal = 0;

  for (const utxo of utxos) {
    const txRes = await axios.get<{ hex: string }>(
      `https://api.blockcypher.com/v1/${coinPath}/txs/${utxo.tx_hash}?includeHex=true&token=${config.BLOCKCYPHER_TOKEN}`,
      { timeout: 10000 },
    );
    psbt.addInput({
      hash:               utxo.tx_hash,
      index:              utxo.tx_output_n,
      witnessUtxo:        {
        script: bitcoin.payments.p2wpkh({ pubkey: Buffer.from(keyPair.publicKey), network }).output!,
        value:  utxo.value,
      },
    });
    inputTotal += utxo.value;
  }

  const sendSatoshis  = Math.round(parseFloat(trade.amount) * 1e8);
  const estimatedSize = utxos.length * 68 + 2 * 31 + 10;
  const fee           = estimatedSize * feePerByte;
  const change        = inputTotal - sendSatoshis - fee;

  if (change < 0) throw new Error(`Insufficient UTXO funds: have ${inputTotal}, need ${sendSatoshis + fee}`);

  psbt.addOutput({ address: trade.user_wallet_address!, value: sendSatoshis });
  if (change > 546) {
    psbt.addOutput({ address: fromAddress, value: change }); // change back to exchanger
  }

  psbt.signAllInputs(keyPair);
  psbt.finalizeAllInputs();
  const rawHex = psbt.extractTransaction().toHex();

  // Broadcast
  const broadcastRes = await axios.post<{ tx: { hash: string } }>(
    `https://api.blockcypher.com/v1/${coinPath}/txs/push`,
    { tx: rawHex },
    { timeout: 15000 },
  );

  return broadcastRes.data.tx.hash;
}

// ---------------------------------------------------------------------------
// ETH send via Alchemy + ethers.js
// ---------------------------------------------------------------------------

async function sendEth(trade: DbTrade, derivationPath: string): Promise<string> {
  const network   = config.NETWORK === 'testnet' ? 'sepolia' : 'homestead';
  const provider  = new ethers.AlchemyProvider(network, config.ALCHEMY_API_KEY);
  const privateKey = rederivePrivateKey(derivationPath);
  const wallet    = new ethers.Wallet(privateKey.toString('hex'), provider);

  const value = ethers.parseEther(trade.amount);
  const feeData = await provider.getFeeData();

  const tx = await wallet.sendTransaction({
    to:                 trade.user_wallet_address!,
    value,
    maxFeePerGas:       feeData.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  });

  return tx.hash;
}

// ---------------------------------------------------------------------------
// ERC-20 (USDT / USDC) send via Alchemy + ethers.js
// ---------------------------------------------------------------------------

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

const ERC20_ADDRESSES: Record<string, Record<string, string>> = {
  USDT_ERC20: {
    mainnet: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    testnet: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', // Sepolia USDT
  },
  USDC_ERC20: {
    mainnet: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    testnet: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8', // Sepolia USDC
  },
};

async function sendErc20(trade: DbTrade, derivationPath: string): Promise<string> {
  const networkKey = config.NETWORK === 'testnet' ? 'testnet' : 'mainnet';
  const network    = config.NETWORK === 'testnet' ? 'sepolia' : 'homestead';
  const provider   = new ethers.AlchemyProvider(network, config.ALCHEMY_API_KEY);
  const privateKey = rederivePrivateKey(derivationPath);
  const wallet     = new ethers.Wallet(privateKey.toString('hex'), provider);

  const contractAddress = ERC20_ADDRESSES[trade.asset]?.[networkKey];
  if (!contractAddress) throw new Error(`No ERC-20 address for ${trade.asset} on ${networkKey}`);

  const contract   = new ethers.Contract(contractAddress, ERC20_ABI, wallet);
  const decimals   = await contract.decimals() as bigint;
  const amount     = ethers.parseUnits(trade.amount, decimals);

  const tx = await (contract.transfer(trade.user_wallet_address!, amount) as Promise<ethers.ContractTransactionResponse>);
  return tx.hash;
}

// ---------------------------------------------------------------------------
// SPL USDC send via Helius + @solana/web3.js
// ---------------------------------------------------------------------------

const USDC_MINT_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_MINT_DEVNET  = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

async function sendSplUsdc(trade: DbTrade, derivationPath: string): Promise<string> {
  const testnet   = config.NETWORK === 'testnet';
  const rpcUrl    = config.SOL_RPC_URL ||
    (testnet
      ? `https://devnet.helius-rpc.com/?api-key=${config.HELIUS_API_KEY}`
      : `https://mainnet.helius-rpc.com/?api-key=${config.HELIUS_API_KEY}`);

  const connection = new Connection(rpcUrl, 'confirmed');
  const keypair    = rederiveSolKeypair(derivationPath);
  const mint       = testnet ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;
  const mintInfo   = await getMint(connection, mint);

  const amount = BigInt(
    Math.round(parseFloat(trade.amount) * 10 ** mintInfo.decimals),
  );

  const fromAta = await getOrCreateAssociatedTokenAccount(
    connection, keypair, mint, keypair.publicKey,
  );
  const toAta = await getOrCreateAssociatedTokenAccount(
    connection, keypair, mint, new PublicKey(trade.user_wallet_address!),
  );

  const tx = new Transaction().add(
    createTransferInstruction(fromAta.address, toAta.address, keypair.publicKey, amount),
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [keypair], {
    commitment: 'confirmed',
  });

  return sig;
}

// ---------------------------------------------------------------------------
// Confirmation tracking
// ---------------------------------------------------------------------------

async function waitForConfirmations(
  trade: DbTrade,
  _exchangerId: string,
  txId: string,
): Promise<void> {
  const requiredConfs = config.TIMEOUT_CRYPTO_SENT_CONFIRMATIONS;
  const log = logger.child({ tradeId: trade.id, txId });

  // Poll every 30 seconds for up to 2 hours
  const maxAttempts = 240;
  let attempts = 0;

  while (attempts < maxAttempts) {
    await sleep(30_000);
    attempts++;

    try {
      const confs = await getConfirmations(trade.asset, txId);
      log.debug({ confs, required: requiredConfs }, 'Checking confirmations');

      if (confs >= requiredConfs) {
        await transitionTrade({
          tradeId:        trade.id,
          to:             'COMPLETED',
          actorDiscordId: 'SYSTEM',
          note:           `${confs} confirmations received`,
          updates:        { completedAt: new Date() },
        });

        try {
          const { notifyTradeCompleted } = await import('../notifications/notificationService');
          await notifyTradeCompleted(trade.id);
        } catch { /* non-fatal */ }

        log.info('Trade completed — confirmations received');
        return;
      }
    } catch (err) {
      log.warn({ err }, 'Failed to check confirmations — will retry');
    }
  }

  // Timeout — alert admin
  log.error('Confirmation wait timed out');
  try {
    const { sendAdminAlert } = await import('../notifications/notificationService');
    await sendAdminAlert(`⚠️ Confirmation timeout for trade \`${trade.id}\` TX \`${txId}\``);
  } catch { /* non-fatal */ }
}

async function getConfirmations(asset: Asset, txId: string): Promise<number> {
  if (asset === 'BTC' || asset === 'LTC') {
    const coin = asset === 'LTC' ? 'ltc/main' : 'btc/main';
    const res = await axios.get<{ confirmations?: number }>(
      `https://api.blockcypher.com/v1/${coin}/txs/${txId}?token=${config.BLOCKCYPHER_TOKEN}`,
      { timeout: 10000 },
    );
    return res.data.confirmations ?? 0;
  }
  // ETH/ERC-20 and SOL are considered confirmed after broadcast
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
