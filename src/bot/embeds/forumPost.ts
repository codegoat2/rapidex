/**
 * Forum Post Builder
 *
 * Builds the embed and components posted as a forum thread when a new
 * trade opens. Exchangers browse this channel and click Claim Trade.
 *
 * Thread name format: [BUY] €250.00 → BTC · Revolut
 * Thread is locked when claimed and archived after trade completes/cancels.
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

// ---------------------------------------------------------------------------
// Fiat symbol helper
// ---------------------------------------------------------------------------

const FIAT_SYM: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };
function sym(currency: string): string { return FIAT_SYM[currency] ?? currency; }

// ---------------------------------------------------------------------------
// Thread name (shown in forum channel list — max 100 chars)
// ---------------------------------------------------------------------------

export function buildThreadName(trade: DbTrade): string {
  if (trade.direction === 'SWAP') {
    const amt = parseFloat(trade.amount).toFixed(6).replace(/\.?0+$/, '');
    return `SWAP  ${amt} ${trade.asset} → ${trade.swap_to_asset ?? '?'}`.slice(0, 100);
  }

  if (trade.direction === 'FIAT_TO_FIAT') {
    const fiatAmt = `${sym(trade.fiat_currency)}${parseFloat(trade.amount).toFixed(2)}`;
    const from = trade.fiat_method.replace(/_/g, ' ');
    const to   = (trade.fiat_to_method ?? '?').replace(/_/g, ' ');
    return `F2F  ${fiatAmt}  ${from} → ${to}`.slice(0, 100);
  }

  // BUY / SELL — lead with fiat amount
  const fiatPart = trade.fiat_amount
    ? `${sym(trade.fiat_currency)}${parseFloat(trade.fiat_amount).toFixed(2)}`
    : `${parseFloat(trade.amount).toFixed(6).replace(/\.?0+$/, '')} ${trade.asset}`;

  const method = trade.fiat_method.replace(/_/g, ' ');
  return `${trade.direction}  ${fiatPart}  ${trade.asset}  ·  ${method}`.slice(0, 100);
}

// ---------------------------------------------------------------------------
// Forum thread embed (fiat-first, orange theme)
// ---------------------------------------------------------------------------

export function buildForumEmbed(trade: DbTrade): EmbedBuilder {
  const DIRECTION_LABELS: Record<string, string> = {
    BUY:         '📥 Buy Crypto',
    SELL:        '📤 Sell Crypto',
    SWAP:        '🔄 Swap Crypto',
    FIAT_TO_FIAT:'💱 Fiat → Fiat',
  };

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`${DIRECTION_LABELS[trade.direction] ?? trade.direction} — Available to Claim`)
    .addFields(
      {
        name:   '⏱️ Expires',
        value:  trade.expires_at
          ? `<t:${Math.floor(new Date(trade.expires_at).getTime() / 1000)}:R>`
          : 'No expiry',
        inline: true,
      },
      {
        name:   '🕐 Opened',
        value:  `<t:${Math.floor(new Date(trade.created_at).getTime() / 1000)}:R>`,
        inline: true,
      },
      { name: '\u200b', value: '\u200b', inline: true }, // spacer
    );

  // ── BUY: fiat → crypto ──────────────────────────────────────────────────
  if (trade.direction === 'BUY') {
    if (trade.fiat_amount) {
      embed.addFields({
        name:   '💰 Buyer Pays',
        value:  `\`${sym(trade.fiat_currency)}${parseFloat(trade.fiat_amount).toFixed(2)} ${trade.fiat_currency}\``,
        inline: true,
      });
    }
    embed.addFields(
      { name: '📦 Buyer Receives', value: assetLabel(trade.asset),               inline: true },
      { name: '💳 Payment Method', value: fiatMethodLabel(trade.fiat_method),    inline: true },
    );
    if (trade.fiat_amount && trade.rate) {
      embed.addFields({
        name:   '🔢 Crypto Amount',
        value:  `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``,
        inline: true,
      });
    }
  }

  // ── SELL: crypto → fiat ─────────────────────────────────────────────────
  else if (trade.direction === 'SELL') {
    if (trade.fiat_amount) {
      embed.addFields({
        name:   '💰 Buyer Sends',
        value:  `\`${sym(trade.fiat_currency)}${parseFloat(trade.fiat_amount).toFixed(2)} ${trade.fiat_currency}\``,
        inline: true,
      });
    }
    embed.addFields(
      { name: '📦 Buyer Sends (Crypto)', value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
      { name: '💳 Receive Via',          value: fiatMethodLabel(trade.fiat_method),                         inline: true },
    );
  }

  // ── SWAP ────────────────────────────────────────────────────────────────
  else if (trade.direction === 'SWAP') {
    embed.addFields(
      { name: '📤 User Sends',    value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``,           inline: true },
      { name: '📥 User Receives', value: trade.swap_to_asset ? assetLabel(trade.swap_to_asset) : '—',           inline: true },
    );
  }

  // ── FIAT → FIAT ─────────────────────────────────────────────────────────
  else if (trade.direction === 'FIAT_TO_FIAT') {
    embed.addFields(
      { name: '💰 Amount',      value: `\`${sym(trade.fiat_currency)}${parseFloat(trade.amount).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
      { name: '📤 Send Via',    value: fiatMethodLabel(trade.fiat_method),                                                             inline: true },
      { name: '📥 Receive Via', value: trade.fiat_to_method ? fiatMethodLabel(trade.fiat_to_method) : '—',                            inline: true },
    );
  }

  if (trade.user_note) {
    embed.addFields({ name: '📝 Buyer Note', value: trade.user_note, inline: false });
  }

  embed
    .addFields({ name: '🆔 Trade ID', value: `\`${trade.id}\``, inline: false })
    .setFooter({ text: 'RapidEx · Click Claim Trade to accept this order and open a private ticket' })
    .setTimestamp(trade.created_at);

  return embed;
}

// ---------------------------------------------------------------------------
// Claim button row
// ---------------------------------------------------------------------------

export function buildForumClaimRow(tradeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim:${tradeId}`)
      .setLabel('🤝 Claim Trade')
      .setStyle(ButtonStyle.Success),
  );
}
