import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import { COLORS } from '../embeds/colors';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show RapidEx commands and how to get started');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('RapidEx Help')
    .setDescription('Use the trade panel to start an exchange. Available commands:')
    .addFields(
      {
        name: 'User',
        value: '`/help` — Show this help\n`/profile` — View your exchanger profile',
        inline: false,
      },
      {
        name: 'Exchanger',
        value: '`/profile` — View balances, statistics, and deposit addresses',
        inline: false,
      },
      {
        name: 'Admin',
        value: [
          '`/verify-exchanger` — Verify an exchanger',
          '`/setup-panel` — Deploy the trade panel',
          '`/balance` — View an exchanger balance',
          '`/credit` and `/debit` — Adjust an exchanger balance',
          '`/trades` — List trades by status',
          '`/close-ticket` — Close a trade ticket',
          '`/set-fee` — Configure asset fees',
          '`/audit-log` — View audit activity',
          '`/hot-wallet-balance` — View hot wallet balances',
          '`/ban` — Ban an exchanger',
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: 'Need access? Contact a RapidEx administrator.' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
