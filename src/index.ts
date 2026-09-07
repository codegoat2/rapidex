/**
 * RapidEx Bot — Main Entry Point
 *
 * Startup sequence:
 *   1. Validate environment
 *   2. Connect to database
 *   3. Initialise Discord client + register event handlers
 *   4. Start background workers (expiry, monitoring, accounting, reconciliation)
 *   5. Start webhook HTTP server
 *   6. Login to Discord
 */

import 'dotenv/config';
// Railway injects PORT — mirror it into WEBHOOK_PORT before config loads
if (process.env['PORT'] && !process.env['WEBHOOK_PORT']) {
  process.env['WEBHOOK_PORT'] = process.env['PORT'];
}
import * as Sentry from '@sentry/node';
import { Events, Interaction } from 'discord.js';
import { config } from './config/env';
import { logger } from './utils/logger';
import { checkDatabaseHealth, closeDatabase } from './db/client';
import { createDiscordClient } from './bot/client';
import { handleCommand } from './bot/handlers/commandHandler';
import { handleButton, handleSelectMenu } from './bot/handlers/buttonHandler';
import { handleModal } from './bot/handlers/modalHandler';
import { registerCommands } from './bot/register';
import { startExpiryWorker } from './workers/expiryWorker';
import { startAccountingWorker } from './workers/accountingWorker';
import { startMonitoringWorker } from './monitor/monitoringWorker';
import { startReconciliationWorker } from './monitor/reconciliationWorker';
import { startWithdrawalWorker } from './workers/withdrawalWorker';
import { startWebhookServer } from './monitor/webhookServer';

// ---------------------------------------------------------------------------
// Sentry error monitoring
// ---------------------------------------------------------------------------

if (config.SENTRY_DSN) {
  Sentry.init({
    dsn:         config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: 0.1,
  });
  logger.info('Sentry initialised');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.info('RapidEx bot starting...');

  // 1. Database
  const dbHealth = await waitForDatabase();
  if (!dbHealth.healthy) {
    logger.error({ attempts: 5 }, 'Database unreachable after startup retries — aborting');
    process.exit(1);
  }
  logger.info({ latencyMs: dbHealth.latencyMs }, 'Database connected');

  // 2. Discord client
  const client = createDiscordClient();

  client.on(Events.ClientReady, async (c) => {
    logger.info(`Logged in as ${c.user.tag}`);

    // Register slash commands on startup in non-production, or when forced
    if (config.NODE_ENV !== 'production' || process.env['REGISTER_COMMANDS'] === 'true') {
      await registerCommands();
    }

    // Start background workers after client is ready
    startExpiryWorker();
    startAccountingWorker();
    startMonitoringWorker();
    startReconciliationWorker();
    startWithdrawalWorker();
  });

  // 3. Interaction router
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleCommand(interaction);
      } else if (interaction.isButton()) {
        // noq_confirm is a no-quote confirmation (SWAP / FIAT_TO_FIAT)
        if (interaction.customId.startsWith('noq_confirm:')) {
          const encoded = interaction.customId.slice('noq_confirm:'.length);
          const { handleNoQuoteConfirmation } = await import('./bot/handlers/modalHandler');
          await handleNoQuoteConfirmation(interaction, encoded);
        } else {
          await handleButton(interaction);
        }
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
      }
    } catch (err) {
      logger.error({ err }, 'Unhandled interaction error');
      Sentry.captureException(err);
    }
  });

  // 4. Discord error handling
  client.on(Events.Error, (err) => {
    logger.error({ err }, 'Discord client error');
    Sentry.captureException(err);
  });

  client.on(Events.Warn, (msg) => {
    logger.warn({ msg }, 'Discord client warning');
  });

  // 5. Webhook server
  startWebhookServer();

  // 6. Login
  await client.login(config.DISCORD_TOKEN);
}

async function waitForDatabase(): Promise<{ healthy: boolean; latencyMs: number }> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const health = await checkDatabaseHealth();
    if (health.healthy) return health;
    if (attempt < maxAttempts) {
      logger.warn({ attempt, maxAttempts }, 'Database unavailable — retrying startup check');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return { healthy: false, latencyMs: 0 };
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully...');
  try {
    const { getDiscordClient } = await import('./bot/client');
    getDiscordClient().destroy();
  } catch { /* already down */ }
  await closeDatabase();
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT',  () => { void shutdown('SIGINT');  });
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  Sentry.captureException(err);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
  Sentry.captureException(reason);
});

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
