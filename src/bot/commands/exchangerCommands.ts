import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
} from 'discord.js';
import { requirePermission } from '../../security/rbac';
import { getExchangerProfile, setExchangerTerms, getExchangerTerms } from '../../admin/exchangerService';
import { db } from '../../db/client';
import { adminCredit, adminDebit, InsufficientBalanceError } from '../../ledger/ledgerService';
import { manualAdjustmentKey } from '../../security/idempotency';
import { queueWithdrawal } from '../../withdrawal/withdrawalService';
import { COLORS } from '../embeds/colors';
import type { Asset } from '../../types';

const ASSETS: Asset[] = ['BTC', 'LTC', 'ETH', 'SOL', 'BNB', 'USDT_BEP20'];

export const setTermsCommand = new SlashCommandBuilder()
  .setName('set-terms')
  .setDescription('Set or update your personal Terms & Conditions for buyers');

export const viewTermsCommand = new SlashCommandBuilder()
  .setName('my-terms')
  .setDescription('View your current Terms & Conditions');

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

// ---------------------------------------------------------------------------
// /set-terms — exchanger sets their T&C via a modal
// ---------------------------------------------------------------------------

export async function handleSetTerms(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'TRADE_CLAIM');

  const profile = await getExchangerProfile(interaction.user.id);
  if (!profile) {
    await interaction.reply({ content: '❌ You are not a verified exchanger.', ephemeral: true });
    return;
  }

  const existing = await getExchangerTerms(profile.exchanger.id);

  const modal = new ModalBuilder()
    .setCustomId('set_terms_modal')
    .setTitle('Set Your Terms & Conditions');

  const input = new TextInputBuilder()
    .setCustomId('terms_text')
    .setLabel('Your Terms & Conditions')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1800)
    .setPlaceholder(
      'e.g. Payment must be sent within 15 minutes. No chargebacks. By accepting you agree to my rules...',
    );

  if (existing) input.setValue(existing);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleSetTermsModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const profile = await getExchangerProfile(interaction.user.id);
  if (!profile) {
    await interaction.editReply('❌ You are not a verified exchanger.');
    return;
  }

  const terms = interaction.fields.getTextInputValue('terms_text').trim();
  if (!terms) {
    await interaction.editReply('❌ Terms cannot be empty.');
    return;
  }

  await setExchangerTerms({ exchangerDiscordId: interaction.user.id, terms });

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle('✅ Terms & Conditions Updated')
        .setDescription('Your T&C are now active. Buyers will be required to accept them before you can claim their trade.')
        .addFields({ name: 'Your Terms', value: terms.slice(0, 1024) })
        .setTimestamp(),
    ],
  });
}

// ---------------------------------------------------------------------------
// /my-terms — view current T&C
// ---------------------------------------------------------------------------

export async function handleMyTerms(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'TRADE_CLAIM');
  await interaction.deferReply({ ephemeral: true });

  const profile = await getExchangerProfile(interaction.user.id);
  if (!profile) {
    await interaction.editReply('❌ You are not a verified exchanger.');
    return;
  }

  const terms = await getExchangerTerms(profile.exchanger.id);

  if (!terms) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle('📋 Your Terms & Conditions')
          .setDescription('You have not set any Terms & Conditions yet.\nUse `/set-terms` to create them.')
          .setTimestamp(),
      ],
    });
    return;
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle('📋 Your Terms & Conditions')
        .setDescription(terms)
        .setFooter({ text: 'Use /set-terms to update' })
        .setTimestamp(),
    ],
  });
}
