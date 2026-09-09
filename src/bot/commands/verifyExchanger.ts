/**
 * /verify-exchanger @user
 * Admin-only. Assigns exchanger role, creates DB record, provisions addresses.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  EmbedBuilder,
} from 'discord.js';
import { requirePermission } from '../../security/rbac';
import { verifyExchanger } from '../../admin/exchangerService';
import { COLORS } from '../embeds/colors';
import { getRoleExchanger } from '../../config/runtimeConfig';

export const data = new SlashCommandBuilder()
  .setName('verify-exchanger')
  .setDescription('Verify a user as a RapidEx exchanger')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Discord user to verify').setRequired(true),
  )
  .setDefaultMemberPermissions(0); // hidden from non-admins in UI

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'ADMIN_VERIFY');
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('user', true);
  const member = interaction.options.getMember('user') as GuildMember | null;

  if (!member) {
    await interaction.editReply('❌ User is not in this server.');
    return;
  }

  const result = await verifyExchanger({
    targetDiscordId: target.id,
    targetUsername:  target.username,
    adminDiscordId:  interaction.user.id,
  });

  // Assign exchanger role
  try {
    const roleId = await getRoleExchanger();
    if (roleId) await member.roles.add(roleId);
  } catch {
    // Role assignment may fail if bot lacks permission — warn but don't block
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(result.isNew ? '✅ Exchanger Verified' : '✅ Exchanger Re-activated')
    .addFields(
      { name: 'User', value: `<@${target.id}>`, inline: true },
      { name: 'Status', value: result.isNew ? 'New Account' : 'Restored', inline: true },
      { name: 'Deposit Addresses', value: `${result.addresses.length} addresses provisioned`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
