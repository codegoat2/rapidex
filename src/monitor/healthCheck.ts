/**
 * Health check — DB, Discord, and NOWNodes provider status.
 */

import { checkDatabaseHealth } from '../db/client';
import { getDiscordClient } from '../bot/client';
import { logger } from '../utils/logger';
import axios from 'axios';
import { blockbookUrl, blockbookHeaders } from '../config/nownodes';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  checks: {
    database: { healthy: boolean; latencyMs: number };
    discord:  { healthy: boolean; ping: number };
    nownodes: { healthy: boolean };
  };
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const [dbHealth, discordHealth, nnHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkDiscordHealth(),
    checkNowNodesHealth(),
  ]);

  const anyUnhealthy = !dbHealth.healthy || !discordHealth.healthy;

  return {
    status:    anyUnhealthy ? 'unhealthy' : 'healthy',
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealth,
      discord:  discordHealth,
      nownodes: nnHealth,
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

async function checkNowNodesHealth(): Promise<{ healthy: boolean }> {
  try {
    const res = await axios.get(
      `${blockbookUrl('btc')}/`,
      { headers: blockbookHeaders(), timeout: 5000 },
    );
    return { healthy: res.status === 200 };
  } catch {
    return { healthy: false };
  }
}

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
      await sendAdminAlert(`⚠️ **Health Alert** — status: \`${status.status}\`\nFailing: \`${failing}\``);
    } catch { /* non-fatal */ }
  }
}
