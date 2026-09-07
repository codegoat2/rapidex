/**
 * Health check module — used by the webhook Express server
 * and by the Railway/Fly.io health probe.
 */

import { checkDatabaseHealth } from '../db/client';
import { getDiscordClient } from '../bot/client';
import { logger } from '../utils/logger';
import axios from 'axios';
import { config } from '../config/env';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime:    number;
  timestamp: string;
  checks: {
    database:  { healthy: boolean; latencyMs: number };
    discord:   { healthy: boolean; ping: number };
    blockcypher?: { healthy: boolean };
    alchemy?:    { healthy: boolean };
    helius?:     { healthy: boolean };
  };
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const [dbHealth, discordHealth, providerHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkDiscordHealth(),
    checkProviderHealth(),
  ]);

  const allHealthy =
    dbHealth.healthy &&
    discordHealth.healthy;

  const anyUnhealthy =
    !dbHealth.healthy ||
    !discordHealth.healthy;

  return {
    status:    anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      database:  dbHealth,
      discord:   discordHealth,
      ...providerHealth,
    },
  };
}

async function checkDiscordHealth(): Promise<{ healthy: boolean; ping: number }> {
  try {
    const client = getDiscordClient();
    return { healthy: client.isReady(), ping: client.ws.ping };
  } catch {
    return { healthy: false, ping: -1 };
  }
}

async function checkProviderHealth(): Promise<Partial<HealthStatus['checks']>> {
  const results: Partial<HealthStatus['checks']> = {};

  // BlockCypher
  try {
    const res = await axios.get(
      `https://api.blockcypher.com/v1/btc/main?token=${config.BLOCKCYPHER_TOKEN}`,
      { timeout: 5000 },
    );
    results.blockcypher = { healthy: res.status === 200 };
  } catch {
    results.blockcypher = { healthy: false };
  }

  // Alchemy
  try {
    const network = config.NETWORK === 'testnet' ? 'eth-sepolia' : 'eth-mainnet';
    const res = await axios.post(
      `https://${network}.g.alchemy.com/v2/${config.ALCHEMY_API_KEY}`,
      { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 },
      { timeout: 5000 },
    );
    results.alchemy = { healthy: res.status === 200 };
  } catch {
    results.alchemy = { healthy: false };
  }

  // Helius
  try {
    const cluster = config.NETWORK === 'testnet' ? 'devnet' : 'mainnet';
    const res = await axios.post(
      `https://${cluster}.helius-rpc.com/?api-key=${config.HELIUS_API_KEY}`,
      { jsonrpc: '2.0', method: 'getHealth', params: [], id: 1 },
      { timeout: 5000 },
    );
    results.helius = { healthy: res.status === 200 };
  } catch {
    results.helius = { healthy: false };
  }

  return results;
}

/**
 * Periodic health check — posts alert to admin channel on degraded state.
 * Called by the monitoring worker.
 */
export async function runHealthAlerts(): Promise<void> {
  const status = await getHealthStatus();

  if (status.status !== 'healthy') {
    const failing = Object.entries(status.checks)
      .filter(([, v]) => !(v as { healthy: boolean }).healthy)
      .map(([k]) => k)
      .join(', ');

    logger.warn({ status }, 'Health check degraded');

    try {
      const { sendAdminAlert } = await import('../notifications/notificationService');
      await sendAdminAlert(
        `⚠️ **Health Alert** — System status: \`${status.status}\`\nFailing checks: \`${failing}\``,
      );
    } catch { /* non-fatal */ }
  }
}
