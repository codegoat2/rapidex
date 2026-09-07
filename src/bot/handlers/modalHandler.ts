/**
 * Modal Handler — processes modal submissions from Discord.
 *
 * Modals used by RapidEx:
 *   - trade_create   : trade creation form (from panel Start Exchange button)
 *   - wallet_address : user submits their wallet address before release
 */

import {
  ModalSubmitInteraction,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js';
import { z } from 'zod';
import { checkTicketRateLimit } from '../../security/rateLimiter';
import { createTrade } from '../../engine/tradeService';
import { buildTradeEmbed, buildClaimRow } from '../embeds/tradeEmbed';
import { logger } from '../../utils/logger';
import type { Asset, FiatCurrency, FiatMethod, TradeDirection } from '../../types';

// ---------------------------------------------------------------------------
// Zod schemas for modal field validation
// ---------------------------------------------------------------------------

const TradeFormSchema = z.object({
  asset:        z.enum(['BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL']),
  fiat_method:  z.enum(['BANK_TRANSFER', 'REVOLUT', 'WISE', 'PAYPAL', 'CASH_IN_PERSON', 'OTHER']),
  direction:    z.enum(['BUY', 'SELL']),
  amount:       z.string().refine((v) => {
    const n = parseFloat(v);
    return !isNaN(n) && n > 0;
  }, 'Amount must be a positive number'),
  fiat_currency: z.enum(['EUR', 'USD', 'GBP']),
});

const WalletAddressSchema = z.object({
  wallet_address: z.string().min(10).max(200),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [prefix, ...rest] = interaction.customId.split(':');

  try {
    if (prefix === 'trade_create') {
      await handleTradeCreate(interaction);
    } else if (prefix === 'wallet_address') {
      const tradeId = rest[0];
      await handleWalletAddress(interaction, tradeId);
    } else {
      logger.warn({ customId: interaction.customId }, 'Unknown modal');
    }
  } catch (err) {
    logger.error({ err, customId: interaction.customId }, 'Modal handler error');
    const msg = '❌ Something went wrong. Please try again.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Trade creation modal
// ---------------------------------------------------------------------------

async function handleTradeCreate(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  // Rate limit
  if (!checkTicketRateLimit(interaction.user.id)) {
    await interaction.editReply('❌ You\'re creating trades too quickly. Please wait before trying again.');
    return;
  }

  // Validate fields
  const raw = {
    asset:         interaction.fields.getTextInputValue('asset').toUpperCase(),
    fiat_method:   interaction.fields.getTextInputValue('fiat_method').toUpperCase(),
    direction:     interaction.fields.getTextInputValue('direction').toUpperCase(),
    amount:        interaction.fields.getTextInputValue('amount').trim(),
    fiat_currency: interaction.fields.getTextInputValue('fiat_currency').toUpperCase(),
  };

  const parsed = TradeFormSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => `• ${e.path.join('.')}: ${e.message}`).join('\n');
    await interaction.editReply(`❌ Invalid input:\n${errors}`);
    return;
  }

  const { asset, fiat_method, direction, amount, fiat_currency } = parsed.data;

  const guild = interaction.guild!;

  // Create private ticket channel
  const channelName = `trade-${interaction.user.username}-${Date.now().toString(36)}`.toLowerCase().slice(0, 100);

  const ticketChannel = await guild.channels.create({
    name:   channelName,
    type:   ChannelType.GuildText,
    permissionOverwrites: [
      // Deny everyone by default
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      // Allow the user
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
    topic: `RapidEx trade ticket for <@${interaction.user.id}>`,
  });

  // Create trade in DB
  const trade = await createTrade({
    userDiscordId:   interaction.user.id,
    asset:           asset as Asset,
    amount,
    fiatCurrency:    fiat_currency as FiatCurrency,
    fiatMethod:      fiat_method as FiatMethod,
    direction:       direction as TradeDirection,
    ticketChannelId: ticketChannel.id,
  });

  // Post trade summary with Claim button in the ticket channel
  const embed   = buildTradeEmbed(trade);
  const claimRow = buildClaimRow(trade.id);

  embed.setDescription(
    [
      `**User:** <@${interaction.user.id}>`,
      '_Waiting for a verified exchanger to claim this trade..._',
    ].join('\n'),
  );

  await (ticketChannel as TextChannel).send({
    content:    `<@${interaction.user.id}> Your trade ticket is ready.`,
    embeds:     [embed],
    components: [claimRow],
  });

  await interaction.editReply(`✅ Your trade ticket has been created: <#${ticketChannel.id}>`);

  logger.info(
    { tradeId: trade.id, userDiscordId: interaction.user.id, asset, amount },
    'Trade ticket created',
  );
}

// ---------------------------------------------------------------------------
// Wallet address modal (submitted when exchanger clicks Release)
// ---------------------------------------------------------------------------

async function handleWalletAddress(
  interaction: ModalSubmitInteraction,
  tradeId: string,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const raw = { wallet_address: interaction.fields.getTextInputValue('wallet_address').trim() };
  const parsed = WalletAddressSchema.safeParse(raw);

  if (!parsed.success) {
    await interaction.editReply('❌ Invalid wallet address.');
    return;
  }

  // Delegate to trade engine handler
  const { handleWalletAddressSubmit } = await import('./tradeFlowHandler');
  await handleWalletAddressSubmit(interaction, tradeId, parsed.data.wallet_address);
}
