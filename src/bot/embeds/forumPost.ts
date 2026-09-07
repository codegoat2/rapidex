/**
 * Forum Post Builder
 *
 * Builds the embed and components posted as a forum thread when a new
 * trade is created. Exchangers browse this channel and click Claim.
 *
 * Thread name format: [BUY] 0.05 BTC • Revolut
 * Thread is locked when claimed and deleted after trade completes/cancels.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { COLORS } from './colors';
import { assetLabel, fiatMethodLabel } from './tradeEmbed';
import type { DbTrade } from '../../types';

// Custom emoji map (same as tradeEmbed)
const E = {
  BTC:     '<:1425bitcoin:1546527437406343299>',
  LTC:     '<:2625crypto:1546528103176601712>',
  ETH:     '<:3031ethereum:1546527560328941669>',
  SOL:     '<:19845solana:1546527612694831184>',
  USDT:    '<:7541tetherusdt:1546527696937291796>',
  REVOLUT: '<:6383revolut:1546528170130407564>',
  BANK:    '<:bank:1546528985406636113>',
  BINANCE: '<:Binance:1546528855886659678>',
  PAYSAFE: '<:3459paysafecard:1546531852414623774>',
  APPLE:   '<:9823applepaylogo:1546528385470304276>',
  CASHAPP: '<:55778cashapp:1546528307242340462>',
  PAYPAL:  '<:51891paypal:1546528262531059825>',
} as const;

const ASSET_EMOJI: Record<string, string> = {
  BTC:        E.BTC,
  LTC:        E.LTC,
  ETH:        E.ETH,
  SOL:        E.SOL,
  USDT_BEP20: E.USDT,
};

const METHOD_EMOJI: Record<string, string> = {
  REVOLUT:           E.REVOLUT,
  BANK_TRANSFER:     E.BANK,
  BINANCE_GIFT_CARD: E.BINANCE,
  PAYSAFE:           E.PAYSAFE,
  APPLE_PAY:         E.APPLE,
  CASHAPP:           E.CASHAPP,
  PAYPAL:            E.PAYPAL,
};

/**
 * Returns a short thread title shown in the forum channel list.
 * e.g. "BUY  0.05 BTC  •  Revolut"
 */
export function buildThreadName(trade: DbTrade): string {
  const dir = trade.direction;

  if (dir === 'SWAP') {
    const from = trade.asset;
    const to   = trade.swap_to_asset ?? '?';
    const amt  = parseFloat(trade.amount).toFixed(6).replace(/\.?0+$/, '');
    return `SWAP  ${amt} ${from}  →  ${to}`;
  }

  if (dir === 'FIAT_TO_FIAT') {
    const from = fiatMethodLabel(trade.fiat_method).replace(/<:[^>]+>/g, '').trim();
    const to   = trade.fiat_to_method
      ? fiatMethodLabel(trade.fiat_to_method).replace(/<:[^>]+>/g, '').trim()
      : '?';
    const amt  = parseFloat(trade.amount).toFixed(2);
    return `F2F  ${amt} ${trade.fiat_currency}  •  ${from} → ${to}`;
  }

  // BUY / SELL
  const amt    = parseFloat(trade.amount).toFixed(6).replace(/\.?0+$/, '');
  const method = fiatMethodLabel(trade.fiat_method).replace(/<:[^>]+>/g, '').trim();
  return `${dir}  ${amt} ${trade.asset}  •  ${method}`;
}

/**
 * Builds the embed posted inside the forum thread.
 */
export function buildForumEmbed(trade: DbTrade): EmbedBuilder {
  const dirLabel: Record<string, string> = {
    BUY:         'Buy Crypto',
    SELL:        'Sell Crypto',
    SWAP:        'Swap Crypto',
    FIAT_TO_FIAT:'Fiat to Fiat',
  };

  const assetEmoji  = ASSET_EMOJI[trade.asset]  ?? '';
  const methodEmoji = METHOD_EMOJI[trade.fiat_method] ?? '';

  const embed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('Open Trade — Available to Claim')
    .addFields(
      { name: 'Type',     value: dirLabel[trade.direction] ?? trade.direction, inline: true },
      { name: 'Opened',   value: `<t:${Math.floor(new Date(trade.created_at).getTime() / 1000)}:R>`, inline: true },
      { name: 'Expires',  value: trade.expires_at
          ? `<t:${Math.floor(new Date(trade.expires_at).getTime() / 1000)}:R>`
          : 'No expiry',
        inline: true },
    );

  if (trade.direction === 'BUY') {
    embed.addFields(
      { name: 'User receives', value: `${assetEmoji} ${assetLabel(trade.asset)}`,          inline: true },
      { name: 'User pays via', value: `${methodEmoji} ${fiatMethodLabel(trade.fiat_method)}`, inline: true },
      { name: 'Amount',        value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
    );
    if (trade.fiat_amount) {
      embed.addFields(
        { name: 'Fiat total', value: `\`${parseFloat(trade.fiat_amount).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
        { name: 'Rate',       value: trade.rate
            ? `\`1 ${trade.asset} = ${parseFloat(trade.rate).toFixed(2)} ${trade.fiat_currency}\``
            : '—',
          inline: true },
      );
    }
  } else if (trade.direction === 'SELL') {
    embed.addFields(
      { name: 'User sends',     value: `${assetEmoji} ${assetLabel(trade.asset)}`,          inline: true },
      { name: 'User receives via', value: `${methodEmoji} ${fiatMethodLabel(trade.fiat_method)}`, inline: true },
      { name: 'Amount',         value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
    );
    if (trade.fiat_amount) {
      embed.addFields(
        { name: 'Fiat total', value: `\`${parseFloat(trade.fiat_amount).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
      );
    }
  } else if (trade.direction === 'SWAP') {
    embed.addFields(
      { name: 'Send',    value: `${assetEmoji} ${assetLabel(trade.asset)}`, inline: true },
      { name: 'Receive', value: trade.swap_to_asset
          ? `${ASSET_EMOJI[trade.swap_to_asset] ?? ''} ${assetLabel(trade.swap_to_asset)}`
          : '—',
        inline: true },
      { name: 'Amount',  value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
    );
  } else if (trade.direction === 'FIAT_TO_FIAT') {
    const toEmoji = trade.fiat_to_method ? (METHOD_EMOJI[trade.fiat_to_method] ?? '') : '';
    embed.addFields(
      { name: 'Send via',    value: `${methodEmoji} ${fiatMethodLabel(trade.fiat_method)}`, inline: true },
      { name: 'Receive via', value: trade.fiat_to_method
          ? `${toEmoji} ${fiatMethodLabel(trade.fiat_to_method)}`
          : '—',
        inline: true },
      { name: 'Amount', value: `\`${parseFloat(trade.amount).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
    );
  }

  if (trade.user_note) {
    embed.addFields({ name: 'User note', value: trade.user_note, inline: false });
  }

  embed
    .addFields({ name: 'Trade ID', value: `\`${trade.id}\``, inline: false })
    .setFooter({ text: 'Click Claim Trade to accept this order and open a private ticket.' })
    .setTimestamp(trade.created_at);

  return embed;
}

/**
 * The Claim button row for the forum thread.
 */
export function buildForumClaimRow(tradeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim:${tradeId}`)
      .setLabel('Claim Trade')
      .setStyle(ButtonStyle.Success),
  );
}
