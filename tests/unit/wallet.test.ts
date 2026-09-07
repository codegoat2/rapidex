/**
 * Unit tests — HD Wallet address derivation
 *
 * Uses a known test mnemonic to verify addresses are derived correctly
 * and that the same path always produces the same address.
 */

// Mock env config — use a known test mnemonic
jest.mock('../../src/config/env', () => ({
  config: {
    MASTER_WALLET_MNEMONIC:
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    NETWORK: 'testnet',
    ENCRYPTION_KEY: 'a'.repeat(64),
    NODE_ENV: 'test',
  },
}));

import {
  deriveBtcAddress,
  deriveLtcAddress,
  deriveEthAddress,
  deriveSolAddress,
  deriveAllAddresses,
  rederivePrivateKey,
} from '../../src/wallet/hdWallet';

describe('HD Wallet derivation', () => {
  test('deriveBtcAddress returns valid testnet bech32 address', () => {
    const result = deriveBtcAddress(0);
    expect(result.address).toMatch(/^tb1[a-z0-9]{6,}/);
    expect(result.chain).toBe('bitcoin');
    expect(result.asset).toBe('BTC');
    expect(result.derivationPath).toBe("m/44'/1'/0'/0/0");
  });

  test('deriveLtcAddress returns valid testnet address', () => {
    const result = deriveLtcAddress(0);
    expect(result.address).toBeDefined();
    expect(result.chain).toBe('litecoin');
    expect(result.asset).toBe('LTC');
  });

  test('deriveEthAddress returns checksummed EIP-55 address', () => {
    const result = deriveEthAddress(0);
    expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.chain).toBe('ethereum');
    expect(result.asset).toBe('ETH');
    expect(result.derivationPath).toBe("m/44'/60'/0'/0/0");
  });

  test('deriveEthAddress with USDT_ERC20 asset', () => {
    const result = deriveEthAddress(0, 'USDT_ERC20');
    expect(result.asset).toBe('USDT_ERC20');
    // Same address as ETH — same derivation path
    expect(result.address).toBe(deriveEthAddress(0, 'ETH').address);
  });

  test('deriveSolAddress returns base58 public key', () => {
    const result = deriveSolAddress(0);
    expect(result.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(result.chain).toBe('solana');
    expect(result.asset).toBe('USDC_SPL');
  });

  test('same account index always produces same address (deterministic)', () => {
    expect(deriveBtcAddress(0).address).toBe(deriveBtcAddress(0).address);
    expect(deriveEthAddress(0).address).toBe(deriveEthAddress(0).address);
    expect(deriveSolAddress(0).address).toBe(deriveSolAddress(0).address);
  });

  test('different account indices produce different addresses', () => {
    expect(deriveBtcAddress(0).address).not.toBe(deriveBtcAddress(1).address);
    expect(deriveEthAddress(0).address).not.toBe(deriveEthAddress(1).address);
    expect(deriveSolAddress(0).address).not.toBe(deriveSolAddress(1).address);
  });

  test('deriveAllAddresses returns 6 addresses for all supported assets', () => {
    const addresses = deriveAllAddresses(0);
    expect(addresses).toHaveLength(6);
    const assets = addresses.map(a => a.asset).sort();
    expect(assets).toEqual(['BTC', 'ETH', 'LTC', 'USDC_ERC20', 'USDC_SPL', 'USDT_ERC20'].sort());
  });

  test('rederivePrivateKey produces a 32-byte buffer', () => {
    const path = deriveBtcAddress(0).derivationPath;
    const key = rederivePrivateKey(path);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  test('rederived private key matches original derivation', () => {
    const addr = deriveEthAddress(5);
    const key  = rederivePrivateKey(addr.derivationPath);
    // Re-derive address from the private key and compare
    const { ethers } = require('ethers') as typeof import('ethers');
    const wallet = new ethers.Wallet(key.toString('hex'));
    expect(wallet.address).toBe(addr.address);
  });

  test('no private key is stored in DerivedAddress object', () => {
    const addr = deriveBtcAddress(0);
    // The returned object must NOT have a privateKey field
    expect((addr as Record<string, unknown>)['privateKey']).toBeUndefined();
    expect((addr as Record<string, unknown>)['private_key']).toBeUndefined();
  });
});
