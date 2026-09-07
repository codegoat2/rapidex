/**
 * Discord client singleton.
 * Initialised once in src/index.ts and accessed everywhere via getDiscordClient().
 */

import { Client, GatewayIntentBits, Partials } from 'discord.js';

let _client: Client | null = null;

export function createDiscordClient(): Client {
  _client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
  });
  return _client;
}

export function getDiscordClient(): Client {
  if (!_client) throw new Error('Discord client not initialised — call createDiscordClient() first');
  return _client;
}
