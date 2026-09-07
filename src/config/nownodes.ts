/**
 * NOWNodes endpoint configuration.
 *
 * NOWNodes provides two API surfaces per chain:
 *
 *   1. RPC Node   — standard JSON-RPC (Bitcoin Core / Ethereum / Solana)
 *      Base URL:  https://<chain>.nownodes.io/<API_KEY>
 *      Auth:      API key in the URL path
 *
 *   2. Blockbook  — Trezor Blockbook REST API (UTXO chains: BTC, LTC)
 *      Base URL:  https://<chain>book.nownodes.io/api/v2
 *      Auth:      api-key HTTP header
 *
 * Single API key covers all chains.
 */

import { config } from './env';

export function rpcUrl(chain: 'btc' | 'ltc' | 'eth' | 'sol'): string {
  const testnet = config.NETWORK === 'testnet';

  switch (chain) {
    case 'btc':
      return testnet
        ? `https://btc-testnet.nownodes.io/${config.NOWNODES_API_KEY}`
        : `https://btc.nownodes.io/${config.NOWNODES_API_KEY}`;
    case 'ltc':
      // LTC has no official testnet on NOWNodes — use mainnet in both modes
      return `https://ltc.nownodes.io/${config.NOWNODES_API_KEY}`;
    case 'eth':
      return testnet
        ? `https://eth-sepolia.nownodes.io/${config.NOWNODES_API_KEY}`
        : `https://eth.nownodes.io/${config.NOWNODES_API_KEY}`;
    case 'sol':
      return testnet
        ? `https://sol-devnet.nownodes.io/${config.NOWNODES_API_KEY}`
        : `https://sol.nownodes.io/${config.NOWNODES_API_KEY}`;
  }
}

export function blockbookUrl(chain: 'btc' | 'ltc'): string {
  const testnet = config.NETWORK === 'testnet';

  switch (chain) {
    case 'btc':
      return testnet
        ? 'https://btcbook-testnet.nownodes.io/api/v2'
        : 'https://btcbook.nownodes.io/api/v2';
    case 'ltc':
      return 'https://ltcbook.nownodes.io/api/v2';
  }
}

/** Common headers for Blockbook REST calls */
export function blockbookHeaders(): Record<string, string> {
  return { 'api-key': config.NOWNODES_API_KEY };
}

/** USDC SPL mint address per network */
export const USDC_MINT = {
  mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  testnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
} as const;

/** ERC-20 contract addresses */
export const ERC20_CONTRACTS: Record<string, { mainnet: string; testnet: string }> = {
  USDT_ERC20: {
    mainnet: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    testnet: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
  },
  USDC_ERC20: {
    mainnet: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    testnet: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
  },
};
