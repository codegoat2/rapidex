import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { requirePermission } from '../../security/rbac';
import { getExchangerProfile } from '../../admin/exchangerService';
import { db } from '../../db/client';
import { adminCredit, adminDebit, InsufficientBalanceError } from '../../ledger/ledgerService';
import { manualAdjustmentKey } from '../../security/idempotency';
import { queueWithdrawal } from '../../withdrawal/withdrawalService';
import type { Asset } from '../../types';

const ASSETS: Asset[] = ['BTC', 'LTC', 'ETH', 'SOL', 'BNB', 'USDT_BEP20'];

export const myTradesCommand = new SlashCommandBuilder()
  .setName('my-trades')
  .setDescription('View your recent exchanger trades');

export const depositAddressesCommand = new SlashCommandBuilder()
  .setName('deposit-addresses')
  .setDescription('View your crypto deposit addresses');

export const withdrawCommand = new SlashCommandBuilder()
  .setName('withdraw')
  .setDescription('Withdraw available exchanger funds to a wallet')
  .addStringOption(o => o.setName('asset').setDescription('Asset to withdraw').setRequired(true).addChoices(
    ...ASSETS.map(asset => ({ name: asset, value: asset })),
  ))
  .addStringOption(o => o.setName('amount').setDescription('Amount to withdraw').setRequired(true))
  .addStringOption(o => o.setName('destination').setDescription('Destination wallet address').setRequired(true));

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

export async function handleWithdraw(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'TRADE_CLAIM');
  await interaction.deferReply({ ephemeral: true });

  const profile = await getExchangerProfile(interaction.user.id);
  if (!profile) { await interaction.editReply('❌ You are not a verified exchanger.'); return; }

  const asset = interaction.options.getString('asset', true) as Asset;
  const amount = interaction.options.getString('amount', true).trim();
  const destination = interaction.options.getString('destination', true).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    await interaction.editReply('❌ Amount must be a positive number.'); return;
  }
  if (destination.length < 10 || destination.length > 200) {
    await interaction.editReply('❌ Destination address is invalid.'); return;
  }

  const key = manualAdjustmentKey(profile.exchanger.id, 'MANUAL_DEBIT', interaction.user.id, Date.now());
  let debited = false;
  try {
    await adminDebit({
      exchangerId: profile.exchanger.id,
      asset,
      amount,
      reference: `Exchanger withdrawal request to ${destination}`,
      idempotencyKey: key,
    });
    debited = true;
    const withdrawalId = await queueWithdrawal({
      tradeId: null,
      exchangerId: profile.exchanger.id,
      asset,
      amount,
      destination,
    });
    await interaction.editReply(`✅ Withdrawal queued: \`${withdrawalId}\`. Your available balance has been reserved.`);
  } catch (err) {
    if (debited) {
      await adminCredit({
        exchangerId: profile.exchanger.id,
        asset,
        amount,
        reference: 'Refund for failed withdrawal queue submission',
        idempotencyKey: manualAdjustmentKey(profile.exchanger.id, 'MANUAL_CREDIT', interaction.user.id, Date.now()),
      }).catch(() => undefined);
    }
    if (err instanceof InsufficientBalanceError) {
      await interaction.editReply(`❌ ${err.message}`);
      return;
    }
    throw err;
  }
}