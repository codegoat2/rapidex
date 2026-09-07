/**
 * NOWNodes endpoint configuration.
 *
 * NOWNodes provides two API surfaces per chain:
 *
 *   1. RPC Node   — standard JSON-RPC (Bitcoin Core / Ethereum / Solana / BSC)
 *      Base URL:  https://<chain>.nownodes.io/<API_KEY>
 *      Auth:      API key in the URL path
 *
 *   2. Blockbook  — Trezor Blockbook REST API (UTXO chains: BTC, LTC)
 *      Base URL:  https://<chain>book.nownodes.io/api/v2
 *      Auth:      api-key HTTP header
 *
 * Single API key covers all chains.
 *
 * Supported nodes: BTC, LTC, ETH, SOL, BNB (BSC)
 * Supported tradeable assets: BTC, LTC, ETH, SOL, USDT_BEP20
 */

import { config } from './env';

export function rpcUrl(chain: 'btc' | 'ltc' | 'eth' | 'sol' | 'bnb'): string {
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
    case 'bnb':
      // BSC testnet is available on NOWNodes
      return testnet
        ? `https://bsc-testnet.nownodes.io/${config.NOWNODES_API_KEY}`
        : `https://bsc.nownodes.io/${config.NOWNODES_API_KEY}`;
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

/** BEP-20 contract addresses (Binance Smart Chain) */
export const BEP20_CONTRACTS: Record<string, { mainnet: string; testnet: string }> = {
  USDT_BEP20: {
    mainnet: '0x55d398326f99059fF775485246999027B3197955',
    testnet: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', // BSC testnet USDT
  },
};

/** ERC-20 contract addresses (Ethereum — kept for reference, not traded) */
export const ERC20_CONTRACTS: Record<string, { mainnet: string; testnet: string }> = {
  USDT_ERC20: {
    mainnet: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    testnet: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
  },
};
