/**
 * /setup-panel
 * Admin-only. Deploys the persistent RapidEx trade panel to the current channel.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
} from 'discord.js';
import { requirePermission } from '../../security/rbac';
import { buildPanelEmbed, buildPanelRow } from '../embeds/tradeEmbed';
import { db } from '../../db/client';

export const data = new SlashCommandBuilder()
  .setName('setup-panel')
  .setDescription('Deploy the RapidEx trade panel to this channel (admin only)')
  .setDefaultMemberPermissions(0);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'SETUP_PANEL');
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel as TextChannel;

  // Fetch the guild's icon URL for the panel thumbnail
  const guild = interaction.guild;
  const guildIconUrl = guild?.iconURL({ size: 256, extension: 'png' }) ?? null;

  const msg = await channel.send({
    embeds:     [buildPanelEmbed(guildIconUrl)],
    components: [buildPanelRow()],
  });

  // Audit log
  await db`
    INSERT INTO audit_logs (actor_discord_id, action, entity_type, entity_id, metadata)
    VALUES (
      ${interaction.user.id},
      'PANEL_DEPLOYED',
      'channel',
      ${channel.id},
      ${JSON.stringify({ messageId: msg.id, channelId: channel.id })}::jsonb
    )
  `;

  await interaction.editReply(`<:GreenCheckmark:1547332810048667659> Trade panel deployed in <#${channel.id}>.`);
}
