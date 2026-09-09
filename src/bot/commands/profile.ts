/**
 * /profile [user]
 * Shows an exchanger's balance, stats, and deposit addresses.
 * Exchangers can view their own; admins can view anyone's.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { requirePermission, canPerform } from '../../security/rbac';
import { getExchangerProfile } from '../../admin/exchangerService';
import { COLORS } from '../embeds/colors';
import type { GuildMember } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View exchanger profile, balances, and deposit addresses')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Exchanger to view (admin only)').setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'TRADE_CLAIM');
  await interaction.deferReply({ ephemeral: true });

  const member = interaction.member as GuildMember;
  const targetUser = interaction.options.getUser('user');

  // Only admins can view other users' profiles
  if (targetUser && targetUser.id !== interaction.user.id) {
    if (!canPerform(member, 'ADMIN_VIEW')) {
      await interaction.editReply('❌ Only admins can view other users\' profiles.');
      return;
    }
  }

  const discordId = targetUser?.id ?? interaction.user.id;
  const profile = await getExchangerProfile(discordId);

  if (!profile) {
    await interaction.editReply('❌ No exchanger profile found. Contact an admin to get verified.');
    return;
  }

  const { exchanger, addresses, balances, stats } = profile;

  // --- Balance fields ---
  const balanceLines = Object.values(balances)
    .filter((b) => parseFloat(b.available) > 0 || parseFloat(b.escrow) > 0)
    .map((b) => `**${b.asset}** — Available: \`${parseFloat(b.available).toFixed(8)}\` | Escrow: \`${parseFloat(b.escrow).toFixed(8)}\``)
    .join('\n') || '_No balances yet_';

  // --- Address fields ---
  const addressLines = addresses
    .map((a) => `**${a.asset}** — \`${a.address}\``)
    .join('\n') || '_No addresses provisioned_';

  // --- Volume ---
  const volumeLines = Object.entries(stats.totalVolume)
    .map(([asset, vol]) => `${asset}: ${parseFloat(vol).toFixed(8)}`)
    .join(' | ') || '_No completed trades_';

  const embed = new EmbedBuilder()
    .setColor(exchanger.is_banned ? COLORS.ERROR : COLORS.PRIMARY)
    .setTitle(`<:Arrow:1547330759571017768> Exchanger Profile — ${exchanger.discord_username}`)
    .setDescription(exchanger.is_banned ? `<:emojigg_no:1547332976201830441> **BANNED** — ${exchanger.ban_reason ?? 'No reason given'}` : null)
    .addFields(
      { name: '<:DebtCard:1547332209684381756> Balances', value: balanceLines },
      { name: '<:Arrow:1547330759571017768> Stats',
        value: [
          `Completed: **${stats.completedTrades}**`,
          `Disputed: **${stats.disputedTrades}**`,
          `Cancelled: **${stats.cancelledTrades}**`,
        ].join(' | '),
        inline: false,
      },
      { name: '<:Arrow:1547330759571017768> Total Volume', value: volumeLines, inline: false },
      { name: '<:Arrow:1547330759571017768> Deposit Addresses', value: addressLines },
    )
    .setFooter({ text: `ID: ${exchanger.id}` })
    .setTimestamp(exchanger.verified_at);

  await interaction.editReply({ embeds: [embed] });
}
