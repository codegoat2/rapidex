/**
 * HD Wallet — BIP32/BIP39 key derivation for all supported chains.
 *
 * Master mnemonic lives ONLY in the MASTER_WALLET_MNEMONIC env var.
 * Only derivation paths are stored in the DB — never private keys.
 *
 * Derivation scheme (BIP44):
 *   m/44'/<coin_type>'/<account>'/0/<index>
 *
 *   BTC  mainnet: coin_type = 0
 *   BTC  testnet: coin_type = 1
 *   LTC  mainnet: coin_type = 2
 *   ETH  mainnet: coin_type = 60
 *   SOL  mainnet: coin_type = 501
 *
 * Each exchanger gets a unique account index stored in the DB.
 */

import * as bip39 from 'bip39';
import { BIP32Factory, BIP32Interface } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { ethers } from 'ethers';
import { Keypair } from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import type { Asset, Chain } from '../types';

const bip32 = BIP32Factory(ecc);

// ---------------------------------------------------------------------------
// Network configs
// ---------------------------------------------------------------------------

const BTC_MAINNET = bitcoin.networks.bitcoin;
const BTC_TESTNET = bitcoin.networks.testnet;
const LTC_MAINNET: bitcoin.Network = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: { public: 0x019da462, private: 0x019d9cfe },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};
const LTC_TESTNET: bitcoin.Network = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'tltc',
  bip32: { public: 0x0436f6e1, private: 0x0436ef7d },
  pubKeyHash: 0x6f,
  scriptHash: 0x3a,
  wif: 0xef,
};

// ---------------------------------------------------------------------------
// Master seed (singleton — derived once at startup)
// ---------------------------------------------------------------------------

let _masterSeed: Buffer | null = null;

function getMasterSeed(): Buffer {
  if (_masterSeed) return _masterSeed;

  const mnemonic = config.MASTER_WALLET_MNEMONIC;
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('MASTER_WALLET_MNEMONIC is not a valid BIP39 mnemonic');
  }
  _masterSeed = Buffer.from((bip39 as any).mnemonicToSeedSync(mnemonic));
  logger.info('HD wallet master seed loaded');
  return _masterSeed;
}

function getRoot(): BIP32Interface {
  return bip32.fromSeed(getMasterSeed());
}

// ---------------------------------------------------------------------------
// Coin type per chain/network
// ---------------------------------------------------------------------------

function coinType(chain: 'bitcoin' | 'litecoin', testnet: boolean): number {
  if (chain === 'litecoin') return testnet ? 1 : 2;
  return testnet ? 1 : 0; // bitcoin
}

// ---------------------------------------------------------------------------
// Address derivation
// ---------------------------------------------------------------------------

export interface DerivedAddress {
  address: string;
  derivationPath: string;
  publicKey: string; // hex — for verification only
  chain: Chain;
  asset: Asset;
}

/**
 * Derives a BTC Native SegWit (bech32) address.
 */
export function deriveBtcAddress(accountIndex: number): DerivedAddress {
  const testnet = config.NETWORK === 'testnet';
  const network = testnet ? BTC_TESTNET : BTC_MAINNET;
  const ct = coinType('bitcoin', testnet);
  const path = `m/44'/${ct}'/${accountIndex}'/0/0`;

  const root = getRoot();
  const child = root.derivePath(path);

  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(child.publicKey),
    network,
  });

  if (!address) throw new Error(`Failed to derive BTC address at path ${path}`);

  return {
    address,
    derivationPath: path,
    publicKey: Buffer.from(child.publicKey).toString('hex'),
    chain: 'bitcoin',
    asset: 'BTC',
  };
}

/**
 * Derives an LTC Native SegWit (bech32) address.
 */
export function deriveLtcAddress(accountIndex: number): DerivedAddress {
  const testnet = config.NETWORK === 'testnet';
  const network = testnet ? LTC_TESTNET : LTC_MAINNET;
  const ct = coinType('litecoin', testnet);
  const path = `m/44'/${ct}'/${accountIndex}'/0/0`;

  const root = getRoot();
  const child = root.derivePath(path);

  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(child.publicKey),
    network,
  });

  if (!address) throw new Error(`Failed to derive LTC address at path ${path}`);

  return {
    address,
    derivationPath: path,
    publicKey: Buffer.from(child.publicKey).toString('hex'),
    chain: 'litecoin',
    asset: 'LTC',
  };
}

/**
 * Derives an ETH address (also used for ERC-20 tokens: USDT, USDC).
 */
export function deriveEthAddress(accountIndex: number, asset: 'ETH' | 'USDT_ERC20' | 'USDC_ERC20' = 'ETH'): DerivedAddress {
  const path = `m/44'/60'/${accountIndex}'/0/0`;

  const root = getRoot();
  const child = root.derivePath(path);

  const wallet = new ethers.Wallet(Buffer.from(child.privateKey!).toString('hex'));

  return {
    address: wallet.address, // checksummed EIP-55
    derivationPath: path,
    publicKey: Buffer.from(child.publicKey).toString('hex'),
    chain: 'ethereum',
    asset,
  };
}

/**
 * Derives a Solana address (also used for SPL tokens: USDC).
 * Solana uses ed25519 — derived via ed25519-hd-key.
 */
export function deriveSolAddress(accountIndex: number, asset: 'USDC_SPL' = 'USDC_SPL'): DerivedAddress {
  const path = `m/44'/501'/${accountIndex}'/0'`;
  const seed = getMasterSeed();

  const { key } = derivePath(path, seed.toString('hex'));
  const keypair = Keypair.fromSeed(Uint8Array.from(key));

  return {
    address: keypair.publicKey.toBase58(),
    derivationPath: path,
    publicKey: Buffer.from(keypair.publicKey.toBytes()).toString('hex'),
    chain: 'solana',
    asset,
  };
}

/**
 * Derives all deposit addresses for a given exchanger account index.
 * Returns one address per supported asset.
 */
export function deriveAllAddresses(accountIndex: number): DerivedAddress[] {
  return [
    deriveBtcAddress(accountIndex),
    deriveLtcAddress(accountIndex),
    deriveEthAddress(accountIndex, 'ETH'),
    deriveEthAddress(accountIndex, 'USDT_ERC20'),
    deriveEthAddress(accountIndex, 'USDC_ERC20'),
    deriveSolAddress(accountIndex, 'USDC_SPL'),
  ];
}

/**
 * Re-derives a private key from a stored derivation path.
 * Used only when signing a transaction — key is used and discarded immediately.
 *
 * ⚠️  Never log or store the returned key.
 */
export function rederivePrivateKey(derivationPath: string): Buffer {
  const root = getRoot();
  const child = root.derivePath(derivationPath);
  if (!child.privateKey) {
    throw new Error(`Cannot derive private key at path ${derivationPath}`);
  }
  return Buffer.from(child.privateKey);
}

/**
 * Re-derives a Solana Keypair from a stored derivation path.
 *
 * ⚠️  Never log or store the returned keypair.
 */
export function rederiveSolKeypair(derivationPath: string): Keypair {
  const seed = getMasterSeed();
  const { key } = derivePath(derivationPath, seed.toString('hex'));
  return Keypair.fromSeed(Uint8Array.from(key));
}
