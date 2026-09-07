/**
 * Registers all slash commands with Discord via the REST API.
 * Run once: ts-node src/bot/register.ts
 * Or automatically on bot startup if REGISTER_COMMANDS=true.
 */

import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { config } from '../config/env';
import { data as verifyData } from './commands/verifyExchanger';
import { data as profileData } from './commands/profile';
import { data as setupPanelData } from './commands/setupPanel';
import { allAdminCommandData } from './commands/adminCommands';
import { logger } from '../utils/logger';

const commands = [
  verifyData.toJSON(),
  profileData.toJSON(),
  setupPanelData.toJSON(),
  ...allAdminCommandData.map(c => c.toJSON()),
];

export async function registerCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

  logger.info(`Registering ${commands.length} slash commands...`);

  await rest.put(
    Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
    { body: commands },
  );

  logger.info('Slash commands registered successfully');
}

// Allow running standalone: ts-node src/bot/register.ts
if (require.main === module) {
  registerCommands().catch((err) => {
    logger.error({ err }, 'Failed to register commands');
    process.exit(1);
  });
}
