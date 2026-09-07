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
import * as bitcoin from 'bitcoinjs-lib';
import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import { checkTicketRateLimit } from '../../security/rateLimiter';
import { createTrade } from '../../engine/tradeService';
import { buildTradeEmbed, buildClaimRow } from '../embeds/tradeEmbed';
import { logger } from '../../utils/logger';
import { config } from '../../config/env';
import { getTicketCategory } from '../../config/runtimeConfig';
import type { Asset, DbTrade, FiatCurrency, FiatMethod, TradeDirection } from '../../types';

// ---------------------------------------------------------------------------
// Zod schemas for modal field validation
// ---------------------------------------------------------------------------

const TradeFormSchema = z.object({
  asset:        z.enum(['BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL']),
  fiat_method:  z.enum(['BANK_TRANSFER', 'REVOLUT', 'WISE', 'PAYPAL', 'CASH_IN_PERSON', 'OTHER']),
  direction:    z.enum(['BUY', 'SELL']),
  amount:       z.string().refine((v) => {
    return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v) && Number.isFinite(Number(v)) && Number(v) > 0;
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

  if (direction === 'SELL') {
    await interaction.editReply('❌ SELL trades are not available yet. Please choose BUY.');
    return;
  }

  const guild = interaction.guild!;

  const safeUsername = interaction.user.username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32)
    .replace(/^-|-$/g, '') || 'user';
  const channelName = `trade-${safeUsername}-${Date.now().toString(36)}`.slice(0, 100);
  const configuredCategoryId = await getTicketCategory();
  const category = configuredCategoryId
    ? guild.channels.cache.get(configuredCategoryId)
    : undefined;
  const parent = category?.type === ChannelType.GuildCategory ? category.id : undefined;

  if (configuredCategoryId && !parent) {
    logger.warn(
      { configuredCategoryId, guildId: guild.id },
      'Ticket category setting is invalid or not visible; creating ticket at server root',
    );
  }

  const ticketChannel = await guild.channels.create({
    name:   channelName,
    type:   ChannelType.GuildText,
    parent,
    permissionOverwrites: [
      // Deny everyone by default
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      // Allow the user
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
    topic: `RapidEx trade ticket for <@${interaction.user.id}>`,
  });

  let trade: DbTrade;
  try {
    trade = await createTrade({
      userDiscordId:   interaction.user.id,
      asset:           asset as Asset,
      amount,
      fiatCurrency:    fiat_currency as FiatCurrency,
      fiatMethod:      fiat_method as FiatMethod,
      direction:       direction as TradeDirection,
      ticketChannelId: ticketChannel.id,
    });
  } catch (error) {
    await ticketChannel.delete('Trade creation failed; removing orphan ticket').catch(() => undefined);
    throw error;
  }

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

  const trade = await (await import('../../engine/tradeService')).getTradeById(tradeId);
  if (!trade || !isValidWalletAddress(trade.asset, parsed.data.wallet_address)) {
    await interaction.editReply('❌ Wallet address is invalid for this asset or network.');
    return;
  }

  // Delegate to trade engine handler
  const { handleWalletAddressSubmit } = await import('./tradeFlowHandler');
  await handleWalletAddressSubmit(interaction, tradeId, parsed.data.wallet_address);
}

function isValidWalletAddress(asset: Asset, address: string): boolean {
  try {
    if (asset === 'ETH' || asset === 'USDT_ERC20' || asset === 'USDC_ERC20') {
      return ethers.isAddress(address);
    }
    if (asset === 'USDC_SPL') {
      new PublicKey(address);
      return true;
    }

    const network = config.NETWORK === 'testnet'
      ? bitcoin.networks.testnet
      : asset === 'LTC'
        ? { messagePrefix: '\\x19Litecoin Signed Message:\\n', bech32: 'ltc', bip32: { public: 0x019da462, private: 0x019d9cfe }, pubKeyHash: 0x30, scriptHash: 0x32, wif: 0xb0 }
        : bitcoin.networks.bitcoin;
    bitcoin.address.toOutputScript(address, network);
    return true;
  } catch {
    return false;
  }
}
