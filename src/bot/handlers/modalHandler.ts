/**
 * Modal Handler — processes all modal submissions.
 *
 * Modals:
 *   trade_modal:<direction>:<param1>:<param2>
 *     direction = BUY | SELL | SWAP | FIAT_TO_FIAT
 *     BUY/SELL:       param1=crypto,      param2=fiatMethod
 *     SWAP:           param1=fromCrypto,  param2=toCrypto
 *     FIAT_TO_FIAT:   param1=fromMethod,  param2=toMethod
 *
 *   wallet_address:<tradeId>
 *     exchanger submits user's destination wallet before release
 */

import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js';
import { z } from 'zod';
import * as bitcoin from 'bitcoinjs-lib';
import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import { checkTicketRateLimit } from '../../security/rateLimiter';
import { createTrade } from '../../engine/tradeService';
import { buildTradeEmbed, buildClaimRow, fiatMethodLabel, assetLabel } from '../embeds/tradeEmbed';
import { logger } from '../../utils/logger';
import { config } from '../../config/env';
import { getTicketCategory } from '../../config/runtimeConfig';
import { getSettingBool } from '../../admin/settingsService';
import { createTradeQuote, consumeTradeQuote, type TradeQuote } from '../../quote/quoteService';
import { COLORS } from '../embeds/colors';
import type { Asset, DbTrade, FiatCurrency, FiatMethod, TradeDirection } from '../../types';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const VALID_ASSETS   = ['BTC', 'LTC', 'ETH', 'SOL', 'USDT_BEP20', 'BNB'] as const;
const VALID_METHODS  = [
  'BANK_TRANSFER', 'REVOLUT', 'WISE', 'PAYPAL',
  'CASH_IN_PERSON', 'BINANCE_GIFT_CARD', 'PAYSAFE',
  'APPLE_PAY', 'CASHAPP', 'OTHER',
] as const;
const VALID_DIRS     = ['BUY', 'SELL', 'SWAP', 'FIAT_TO_FIAT'] as const;
const VALID_CURRENCY = ['EUR', 'USD', 'GBP'] as const;

const AmountSchema = z.string().refine(
  (v) => /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v) && Number.isFinite(Number(v)) && Number(v) > 0,
  'Amount must be a positive number',
);

const WalletAddressSchema = z.object({
  wallet_address: z.string().min(10).max(200),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const parts  = interaction.customId.split(':');
  const prefix = parts[0]!;

  try {
    if (prefix === 'trade_modal') {
      // trade_modal:<direction>:<param1>:<param2>
      const direction = parts[1] as string;
      const param1    = parts[2] as string;
      const param2    = parts[3] as string;
      await handleTradeModal(interaction, direction, param1, param2);
    } else if (prefix === 'wallet_address') {
      await handleWalletAddress(interaction, parts[1]!);
    } else if (prefix === 'set_terms_modal') {
      const { handleSetTermsModal } = await import('../commands/exchangerCommands');
      await handleSetTermsModal(interaction);
    } else {
      logger.warn({ customId: interaction.customId }, 'Unknown modal prefix');
    }
  } catch (err) {
    logger.error({ err, customId: interaction.customId }, 'Modal handler error');
    const msg = 'Something went wrong. Please try again.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Trade modal submission
// ---------------------------------------------------------------------------

async function handleTradeModal(
  interaction: ModalSubmitInteraction,
  direction: string,
  param1: string,
  param2: string,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  if (await getSettingBool('MAINTENANCE_MODE')) {
    await interaction.editReply('RapidEx is temporarily in maintenance mode. Please try again later.');
    return;
  }

  if (!checkTicketRateLimit(interaction.user.id)) {
    await interaction.editReply('You are creating trades too quickly. Please wait before trying again.');
    return;
  }

  // ── Validate direction ───────────────────────────────────────────────────
  if (!(VALID_DIRS as readonly string[]).includes(direction)) {
    await interaction.editReply('Invalid trade direction.');
    return;
  }

  // ── Read modal fields ────────────────────────────────────────────────────
  const rawAmount   = interaction.fields.getTextInputValue('amount').trim();
  const rawCurrency = direction !== 'SWAP'
    ? interaction.fields.getTextInputValue('fiat_currency').trim().toUpperCase()
    : 'EUR'; // default; not used for SWAP
  const userNote    = (interaction.fields.fields.get('user_note')?.value ?? '').trim() || null;

  // Amount validation
  const amountResult = AmountSchema.safeParse(rawAmount);
  if (!amountResult.success) {
    await interaction.editReply('Invalid amount. Please enter a positive number.');
    return;
  }

  // Currency validation (skip for SWAP)
  if (direction !== 'SWAP' && !(VALID_CURRENCY as readonly string[]).includes(rawCurrency)) {
    await interaction.editReply('Invalid currency. Use EUR, USD, or GBP.');
    return;
  }

  // ── Validate params per direction ────────────────────────────────────────
  switch (direction) {
    case 'BUY':
    case 'SELL': {
      if (!(VALID_ASSETS as readonly string[]).includes(param1)) {
        await interaction.editReply('Invalid crypto asset.'); return;
      }
      if (!(VALID_METHODS as readonly string[]).includes(param2)) {
        await interaction.editReply('Invalid payment method.'); return;
      }
      break;
    }
    case 'SWAP': {
      if (!(VALID_ASSETS as readonly string[]).includes(param1) || !(VALID_ASSETS as readonly string[]).includes(param2)) {
        await interaction.editReply('Invalid swap assets.'); return;
      }
      if (param1 === param2) {
        await interaction.editReply('Cannot swap a coin for itself.'); return;
      }
      break;
    }
    case 'FIAT_TO_FIAT': {
      if (!(VALID_METHODS as readonly string[]).includes(param1) || !(VALID_METHODS as readonly string[]).includes(param2)) {
        await interaction.editReply('Invalid fiat methods.'); return;
      }
      if (param1 === param2) {
        await interaction.editReply('Sending and receiving method cannot be the same.'); return;
      }
      break;
    }
  }

  const tradeDirection = direction as TradeDirection;
  const fiatCurrency   = rawCurrency as FiatCurrency;

  // ── BUY / SELL: get a live quote ─────────────────────────────────────────
  if (tradeDirection === 'BUY' || tradeDirection === 'SELL') {
    const asset     = param1 as Asset;
    const fiatMethod = param2 as FiatMethod;

    let quote: TradeQuote;
    try {
      quote = await createTradeQuote({
        userDiscordId: interaction.user.id,
        asset,
        amount:        rawAmount,
        direction:     tradeDirection,
        fiatCurrency,
        fiatMethod,
        userNote,
        amountIsFiat:  true,
      });
    } catch (err) {
      await interaction.editReply(`Could not get a quote: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const FIAT_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };
    const sym = FIAT_SYMBOLS[quote.fiatCurrency] ?? quote.fiatCurrency;
    const fiatFeeAmount = (parseFloat(quote.feeAmount) * parseFloat(quote.rate)).toFixed(2);

    const quoteEmbed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle('⚡ Confirm Your Quote')
      .setDescription('This quote is locked for **5 minutes**. Confirm to open your private trade ticket.')
      .addFields(
        {
          name:   tradeDirection === 'BUY' ? '💰 You Pay' : '💰 You Receive',
          value:  `\`${sym}${parseFloat(quote.fiatAmount).toFixed(2)} ${quote.fiatCurrency}\``,
          inline: true,
        },
        {
          name:   tradeDirection === 'BUY' ? '📦 You Receive' : '📦 You Send',
          value:  `\`${parseFloat(quote.amount).toFixed(8)} ${quote.asset}\``,
          inline: true,
        },
        {
          name:   '🏷️ Fee',
          value:  `\`${sym}${fiatFeeAmount} (${quote.feePercentage}%)\``,
          inline: true,
        },
        {
          name:   '💳 Payment Method',
          value:  fiatMethodLabel(quote.fiatMethod),
          inline: true,
        },
        {
          name:   '⏱️ Quote Expires',
          value:  `<t:${Math.floor(quote.expiresAt.getTime() / 1000)}:R>`,
          inline: true,
        },
      )
      .setFooter({ text: 'RapidEx · Rates from CoinGecko · Locked for 5 min' })
      .setTimestamp();

    if (userNote) quoteEmbed.addFields({ name: '📝 Note', value: userNote, inline: false });

    await interaction.editReply({
      embeds: [quoteEmbed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`quote_confirm:${quote.id}`)
          .setLabel('✅ Confirm — Open Ticket')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`quote_cancel:${quote.id}`)
          .setLabel('✖ Cancel')
          .setStyle(ButtonStyle.Secondary),
      )],
    });
    return;
  }

  // ── SWAP / FIAT_TO_FIAT: no live quote needed — go straight to ticket ────
  const asset      = (tradeDirection === 'SWAP' ? param1 : 'BTC') as Asset; // BTC placeholder for F2F
  const fiatMethod = (tradeDirection === 'FIAT_TO_FIAT' ? param1 : 'OTHER') as FiatMethod;
  const swapToAsset      = tradeDirection === 'SWAP' ? (param2 as Asset) : null;
  const fiatToMethod     = tradeDirection === 'FIAT_TO_FIAT' ? (param2 as FiatMethod) : null;

  const FIAT_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };
  const sym = FIAT_SYMBOLS[rawCurrency] ?? rawCurrency;

  const confirmEmbed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(tradeDirection === 'SWAP' ? '🔄 Confirm Swap' : '💱 Confirm Fiat to Fiat')
    .setDescription('Confirm to open your private trade ticket with a verified exchanger.')
    .addFields(
      tradeDirection === 'SWAP'
        ? [
            { name: '📤 You Send',    value: `\`${rawAmount} ${param1}\` — ${assetLabel(param1)}`,  inline: true },
            { name: '📥 You Receive', value: assetLabel(param2),                                    inline: true },
          ]
        : [
            { name: '💰 Amount',      value: `\`${sym}${rawAmount}\``,                             inline: true },
            { name: '📤 Send Via',    value: fiatMethodLabel(param1),                               inline: true },
            { name: '📥 Receive Via', value: fiatMethodLabel(param2),                               inline: true },
          ],
    )
    .setFooter({ text: 'RapidEx · Private Tickets · Verified Exchangers' })
    .setTimestamp();

  if (userNote) confirmEmbed.addFields({ name: '📝 Note', value: userNote, inline: false });

  // Encode the trade params into the button customId for retrieval on confirm
  const encoded = encodeURIComponent(JSON.stringify({
    direction: tradeDirection,
    asset,
    amount: rawAmount,
    fiatCurrency,
    fiatMethod,
    swapToAsset,
    fiatToMethod,
    userNote,
  }));

  await interaction.editReply({
    embeds: [confirmEmbed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`noq_confirm:${encoded}`)
        .setLabel('✅ Confirm — Open Ticket')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`quote_cancel:noquote`)
        .setLabel('✖ Cancel')
        .setStyle(ButtonStyle.Secondary),
    )],
  });
}

// ---------------------------------------------------------------------------
// Quote confirmation (BUY / SELL)
// ---------------------------------------------------------------------------

export async function handleQuoteConfirmation(interaction: ButtonInteraction, quoteId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const quote = await consumeTradeQuote(quoteId, interaction.user.id);
  if (!quote) {
    await interaction.editReply('This quote has expired or was already used. Start a new exchange.');
    return;
  }
  await createTicketFromQuote(interaction, quote);
}

// ---------------------------------------------------------------------------
// No-quote confirmation (SWAP / FIAT_TO_FIAT)
// ---------------------------------------------------------------------------

export async function handleNoQuoteConfirmation(
  interaction: ButtonInteraction,
  encodedParams: string,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  let params: {
    direction: TradeDirection;
    asset: Asset;
    amount: string;
    fiatCurrency: FiatCurrency;
    fiatMethod: FiatMethod;
    swapToAsset: Asset | null;
    fiatToMethod: FiatMethod | null;
    userNote: string | null;
  };

  try {
    params = JSON.parse(decodeURIComponent(encodedParams));
  } catch {
    await interaction.editReply('Invalid trade parameters. Please try again.');
    return;
  }

  await createTicketDirect(interaction, params);
}

// ---------------------------------------------------------------------------
// Ticket creation helpers
// ---------------------------------------------------------------------------

async function createTicketFromQuote(
  interaction: ButtonInteraction,
  quote: TradeQuote,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) { await interaction.editReply('Trade tickets can only be created inside a server.'); return; }

  const channel = await openTicketChannel(interaction);
  if (!channel) return;

  let trade: DbTrade;
  try {
    trade = await createTrade({
      userDiscordId:  interaction.user.id,
      asset:          quote.asset,
      amount:         quote.amount,
      fiatCurrency:   quote.fiatCurrency,
      fiatMethod:     quote.fiatMethod,
      direction:      quote.direction,
      ticketChannelId: channel.id,
      quoteId:        quote.id,
      fiatAmount:     quote.fiatAmount,
      rate:           quote.rate,
      rateSource:     quote.rateSource,
      feePercentage:  quote.feePercentage,
      feeAmount:      quote.feeAmount,
      quoteExpiresAt: quote.expiresAt,
      userNote:       quote.userNote ?? null,
    });
  } catch (err) {
    await channel.delete('Trade creation failed').catch(() => undefined);
    throw err;
  }

  await postTicketMessage(channel, trade, interaction.user.id);
  await interaction.editReply(`Your trade ticket is ready: <#${channel.id}>`);
  logger.info({ tradeId: trade.id, userDiscordId: interaction.user.id }, 'Trade ticket created (quote)');
}

async function createTicketDirect(
  interaction: ButtonInteraction,
  params: {
    direction: TradeDirection;
    asset: Asset;
    amount: string;
    fiatCurrency: FiatCurrency;
    fiatMethod: FiatMethod;
    swapToAsset: Asset | null;
    fiatToMethod: FiatMethod | null;
    userNote: string | null;
  },
): Promise<void> {
  const channel = await openTicketChannel(interaction);
  if (!channel) return;

  let trade: DbTrade;
  try {
    trade = await createTrade({
      userDiscordId:   interaction.user.id,
      asset:           params.asset,
      amount:          params.amount,
      fiatCurrency:    params.fiatCurrency,
      fiatMethod:      params.fiatMethod,
      direction:       params.direction,
      ticketChannelId: channel.id,
      swapToAsset:     params.swapToAsset,
      fiatToMethod:    params.fiatToMethod,
      userNote:        params.userNote,
    });
  } catch (err) {
    await channel.delete('Trade creation failed').catch(() => undefined);
    throw err;
  }

  await postTicketMessage(channel, trade, interaction.user.id);
  await interaction.editReply(`Your trade ticket is ready: <#${channel.id}>`);
  logger.info({ tradeId: trade.id, userDiscordId: interaction.user.id }, 'Trade ticket created (no-quote)');
}

async function openTicketChannel(interaction: ButtonInteraction): Promise<TextChannel | null> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('Trade tickets can only be created inside a server.');
    return null;
  }

  const safeUsername = interaction.user.username
    .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
    .slice(0, 32).replace(/^-|-$/g, '') || 'user';
  const channelName = `trade-${safeUsername}-${Date.now().toString(36)}`.slice(0, 100);

  const configuredCategoryId = await getTicketCategory();
  const category = configuredCategoryId ? guild.channels.cache.get(configuredCategoryId) : undefined;
  const parent   = category?.type === ChannelType.GuildCategory ? category.id : undefined;

  return guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
    topic: `RapidEx trade ticket for <@${interaction.user.id}>`,
  }) as Promise<TextChannel>;
}

async function postTicketMessage(
  channel: TextChannel,
  trade: DbTrade,
  userDiscordId: string,
): Promise<void> {
  const embed = buildTradeEmbed(trade);
  await channel.send({
    content: `<@${userDiscordId}> Your trade ticket has been opened. A verified exchanger will claim it shortly.`,
    embeds:     [embed],
    components: [buildClaimRow(trade.id)],
  });

  // Post to forum channel for exchangers to browse (non-fatal if forum not configured)
  void (await import('../services/forumService')).postTradeToForum(trade);
}

// ---------------------------------------------------------------------------
// Wallet address modal (exchanger submits before releasing)
// ---------------------------------------------------------------------------

async function handleWalletAddress(
  interaction: ModalSubmitInteraction,
  tradeId: string,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const raw    = { wallet_address: interaction.fields.getTextInputValue('wallet_address').trim() };
  const parsed = WalletAddressSchema.safeParse(raw);

  if (!parsed.success) {
    await interaction.editReply('Invalid wallet address format.');
    return;
  }

  const trade = await (await import('../../engine/tradeService')).getTradeById(tradeId);
  if (!trade) {
    await interaction.editReply('Trade not found.');
    return;
  }

  if (!isValidWalletAddress(trade.asset, parsed.data.wallet_address)) {
    await interaction.editReply('Wallet address is not valid for this asset. Please check and try again.');
    return;
  }

  const { handleWalletAddressSubmit } = await import('./tradeFlowHandler');
  await handleWalletAddressSubmit(interaction, tradeId, parsed.data.wallet_address);
}

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

function isValidWalletAddress(asset: Asset, address: string): boolean {
  try {
    if (asset === 'ETH' || asset === 'BNB' || asset === 'USDT_BEP20') {
      return ethers.isAddress(address);
    }
    if (asset === 'SOL') {
      new PublicKey(address);
      return true;
    }
    // BTC / LTC
    const network = config.NETWORK === 'testnet'
      ? bitcoin.networks.testnet
      : asset === 'LTC'
        ? {
            messagePrefix: '\x19Litecoin Signed Message:\n',
            bech32: 'ltc',
            bip32: { public: 0x019da462, private: 0x019d9cfe },
            pubKeyHash: 0x30, scriptHash: 0x32, wif: 0xb0,
          }
        : bitcoin.networks.bitcoin;
    bitcoin.address.toOutputScript(address, network);
    return true;
  } catch {
    return false;
  }
}
