/**
 * Shared embed builders for trade-related Discord messages.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { COLORS } from './colors';
import type { DbTrade } from '../../types';

const STATUS_LABELS: Record<string, string> = {
  OPEN:            '🟢 Open — Awaiting Exchanger',
  CLAIMED:         '🔵 Claimed',
  FIAT_PENDING:    '🟡 Awaiting Fiat Payment',
  FIAT_SENT:       '🟠 Fiat Sent — Awaiting Confirmation',
  RELEASE_PENDING: '🔴 Release Pending',
  CRYPTO_SENT:     '🚀 Crypto Sent',
  COMPLETED:       '✅ Completed',
  CANCELLED:       '❌ Cancelled',
  DISPUTED:        '⚠️ Disputed',
  EXPIRED:         '⏰ Expired',
  FAILED:          '💥 Failed',
};

const STATUS_COLORS: Record<string, number> = {
  OPEN:            COLORS.SUCCESS,
  CLAIMED:         COLORS.INFO,
  FIAT_PENDING:    COLORS.WARNING,
  FIAT_SENT:       COLORS.ESCROW,
  RELEASE_PENDING: COLORS.ESCROW,
  CRYPTO_SENT:     COLORS.PRIMARY,
  COMPLETED:       COLORS.COMPLETED,
  CANCELLED:       COLORS.ERROR,
  DISPUTED:        COLORS.DISPUTED,
  EXPIRED:         COLORS.ERROR,
  FAILED:          COLORS.ERROR,
};

export function buildTradeEmbed(trade: DbTrade, exchangerUsername?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(STATUS_COLORS[trade.status] ?? COLORS.PRIMARY)
    .setTitle('💱 RapidEx Trade')
    .addFields(
      { name: 'Trade ID',       value: `\`${trade.id}\``,                       inline: false },
      { name: 'Direction',      value: trade.direction === 'BUY' ? '🟢 Buy Crypto' : '🔴 Sell Crypto', inline: true },
      { name: 'Asset',          value: `\`${trade.asset}\``,                    inline: true },
      { name: 'Amount',         value: `\`${parseFloat(trade.amount).toFixed(8)}\``, inline: true },
      { name: 'Fiat',           value: `${trade.fiat_currency} via ${trade.fiat_method.replace(/_/g, ' ')}`, inline: true },
      { name: 'Status',         value: STATUS_LABELS[trade.status] ?? trade.status, inline: true },
    )
    .setTimestamp(trade.created_at);

  if (exchangerUsername) {
    embed.addFields({ name: 'Exchanger', value: `@${exchangerUsername}`, inline: true });
  }

  if (trade.tx_id) {
    embed.addFields({ name: '🔗 TX ID', value: `\`${trade.tx_id}\``, inline: false });
  }

  return embed;
}

/** Buttons shown to exchangers on an OPEN trade. */
export function buildClaimRow(tradeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim:${tradeId}`)
      .setLabel('Claim Trade')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✋'),
  );
}

/** Buttons shown inside the trade ticket after claiming. */
export function buildExchangerActionRow(tradeId: string, status: string): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  if (status === 'FIAT_SENT') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`release:${tradeId}`)
        .setLabel('Release Crypto')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💸'),
      new ButtonBuilder()
        .setCustomId(`dispute:${tradeId}`)
        .setLabel('Raise Dispute')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⚠️'),
    );
  }

  return row;
}

/** Button shown to user after exchanger claims — "I've Sent Fiat". */
export function buildUserActionRow(tradeId: string, status: string): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  if (status === 'FIAT_PENDING') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`fiat_sent:${tradeId}`)
        .setLabel("I've Sent Payment")
        .setStyle(ButtonStyle.Primary)
        .setEmoji('💳'),
    );
  }

  if (status === 'FIAT_SENT') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`dispute:${tradeId}`)
        .setLabel('Raise Dispute')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⚠️'),
    );
  }

  return row;
}

/** The persistent panel embed deployed by /setup-panel. */
export function buildPanelEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('💱 RapidEx Exchange')
    .setDescription(
      [
        '**Fast, secure crypto exchange through verified exchangers.**',
        '',
        'Click **Start Exchange** to open a private trade ticket.',
        '',
        '**How it works**',
        '1. Choose your asset, amount, currency, and payment method.',
        '2. A verified exchanger claims your private ticket.',
        '3. Confirm payment and release is handled in the ticket.',
        '',
        '**Assets** `BTC` `LTC` `ETH` `USDT_ERC20` `USDC_ERC20` `USDC_SPL`',
        '**Fiat** `EUR` `USD` `GBP` · Bank Transfer · Revolut · Wise · PayPal · Cash',
      ].join('\n'),
    )
    .setFooter({ text: 'RapidEx — private tickets • verified exchangers' })
    .setTimestamp();
}

export function buildPanelRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('panel:start_exchange')
      .setLabel('Start Exchange')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('💱'),
  );
}
