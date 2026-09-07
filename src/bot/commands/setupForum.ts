/**
 * /setup-forum
 * Admin-only. Points RapidEx at a Forum channel where open trades
 * are posted as threads for exchangers to browse and claim.
 *
 * Usage:
 *   /setup-forum channel:#your-forum-channel
 *
 * The bot will post every new OPEN trade as a forum thread with a
 * Claim button. When an exchanger claims, the thread is locked and
 * the private trade ticket channel opens as normal.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  ForumChannel,
} from 'discord.js';
import { requirePermission } from '../../security/rbac';
import { setSetting } from '../../admin/settingsService';

export const data = new SlashCommandBuilder()
  .setName('setup-forum')
  .setDescription('Set the forum channel where open trades are posted for exchangers (admin only)')
  .addChannelOption((o) =>
    o.setName('channel')
      .setDescription('The Forum channel')
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildForum),
  )
  .setDefaultMemberPermissions(0);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'SETUP_PANEL');
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel('channel', true) as ForumChannel;

  if (channel.type !== ChannelType.GuildForum) {
    await interaction.editReply('That channel is not a Forum channel. Please select a Forum channel.');
    return;
  }

  await setSetting('FORUM_CHANNEL_ID', channel.id, interaction.user.id);

  await interaction.editReply(
    `Forum channel set to <#${channel.id}>.\n\nNew open trades will now be posted there as threads for exchangers to claim.`,
  );
}
