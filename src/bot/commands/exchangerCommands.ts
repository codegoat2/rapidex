import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { requirePermission } from '../../security/rbac';
import { getExchangerProfile } from '../../admin/exchangerService';
import { db } from '../../db/client';

export const myTradesCommand = new SlashCommandBuilder()
  .setName('my-trades')
  .setDescription('View your recent exchanger trades');

export const depositAddressesCommand = new SlashCommandBuilder()
  .setName('deposit-addresses')
  .setDescription('View your crypto deposit addresses');

export async function handleMyTrades(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'TRADE_CLAIM');
  await interaction.deferReply({ ephemeral: true });
  const profile = await getExchangerProfile(interaction.user.id);
  if (!profile) {
    await interaction.editReply('❌ You are not a verified exchanger.');
    return;
  }
  const rows = await db<{ id: string; asset: string; amount: string; status: string; created_at: Date }[]>`
    SELECT id, asset, amount, status, created_at
    FROM trades WHERE exchanger_id = ${profile.exchanger.id}
    ORDER BY created_at DESC LIMIT 20
  `;
  const description = rows.map((trade) =>
    `\`${trade.id.slice(0, 8)}\` **${trade.asset}** ${trade.amount} · **${trade.status}** · <t:${Math.floor(new Date(trade.created_at).getTime() / 1000)}:R>`,
  ).join('\n') || '_No trades yet_';
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📋 My Trades').setDescription(description)],
  });
}

export async function handleDepositAddresses(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'TRADE_CLAIM');
  await interaction.deferReply({ ephemeral: true });
  const profile = await getExchangerProfile(interaction.user.id);
  if (!profile) {
    await interaction.editReply('❌ You are not a verified exchanger.');
    return;
  }
  const description = profile.addresses.map((address) =>
    `**${address.asset}**\n\`${address.address}\``,
  ).join('\n\n') || '_No deposit addresses provisioned_';
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📬 Deposit Addresses').setDescription(description)],
  });
}