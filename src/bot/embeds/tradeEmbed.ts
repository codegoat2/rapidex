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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable label for a fiat method key */
export function fiatMethodLabel(method: string): string {
  const MAP: Record<string, string> = {
    BANK_TRANSFER:     'Bank Transfer',
    REVOLUT:           'Revolut',
    WISE:              'Wise',
    PAYPAL:            'PayPal',
    CASH_IN_PERSON:    'Cash in Person',
    BINANCE_GIFT_CARD: 'Binance Gift Card',
    PAYSAFE:           'Paysafe Card',
    APPLE_PAY:         'Apple Pay',
    CASHAPP:           'CashApp',
    OTHER:             'Other',
  };
  return MAP[method] ?? method.replace(/_/g, ' ');
}

/** Human-readable label for a crypto asset */
export function assetLabel(asset: string): string {
  const MAP: Record<string, string> = {
    BTC:        'Bitcoin (BTC)',
    LTC:        'Litecoin (LTC)',
    ETH:        'Ethereum (ETH)',
    SOL:        'Solana (SOL)',
    USDT_BEP20: 'USDT (BSC)',
    BNB:        'BNB (BSC)',
  };
  return MAP[asset] ?? asset;
}

// ---------------------------------------------------------------------------
// Status display
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  OPEN:            'Open — Awaiting Exchanger',
  CLAIMED:         'Claimed',
  FIAT_PENDING:    'Awaiting Payment',
  FIAT_SENT:       'Payment Sent — Awaiting Confirmation',
  RELEASE_PENDING: 'Release Pending',
  CRYPTO_SENT:     'Crypto Sent',
  COMPLETED:       'Completed',
  CANCELLED:       'Cancelled',
  DISPUTED:        'Disputed',
  EXPIRED:         'Expired',
  FAILED:          'Failed',
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

// ---------------------------------------------------------------------------
// Trade embed
// ---------------------------------------------------------------------------

export function buildTradeEmbed(trade: DbTrade, exchangerUsername?: string): EmbedBuilder {
  const directionLabel = {
    BUY:         'Buy Crypto',
    SELL:        'Sell Crypto',
    SWAP:        'Swap Crypto',
    FIAT_TO_FIAT:'Fiat to Fiat',
  }[trade.direction] ?? trade.direction;

  const embed = new EmbedBuilder()
    .setColor(STATUS_COLORS[trade.status] ?? COLORS.PRIMARY)
    .setTitle('RapidEx — Trade Ticket')
    .addFields(
      { name: 'Trade ID',   value: `\`${trade.id}\``,            inline: false },
      { name: 'Type',       value: directionLabel,                inline: true  },
      { name: 'Status',     value: STATUS_LABELS[trade.status] ?? trade.status, inline: true },
      { name: '\u200b',     value: '\u200b',                      inline: true  }, // spacer
    );

  // Direction-specific fields
  if (trade.direction === 'BUY') {
    embed.addFields(
      { name: 'Receiving',  value: assetLabel(trade.asset),       inline: true },
      { name: 'Paying via', value: fiatMethodLabel(trade.fiat_method), inline: true },
      { name: 'Amount',     value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
    );
  } else if (trade.direction === 'SELL') {
    embed.addFields(
      { name: 'Sending',    value: assetLabel(trade.asset),       inline: true },
      { name: 'Receiving via', value: fiatMethodLabel(trade.fiat_method), inline: true },
      { name: 'Amount',     value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
    );
  } else if (trade.direction === 'SWAP') {
    embed.addFields(
      { name: 'Sending',    value: assetLabel(trade.asset),       inline: true },
      { name: 'Receiving',  value: trade.swap_to_asset ? assetLabel(trade.swap_to_asset) : '—', inline: true },
      { name: 'Amount',     value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
    );
  } else if (trade.direction === 'FIAT_TO_FIAT') {
    embed.addFields(
      { name: 'Sending via',   value: fiatMethodLabel(trade.fiat_method), inline: true },
      { name: 'Receiving via', value: trade.fiat_to_method ? fiatMethodLabel(trade.fiat_to_method) : '—', inline: true },
      { name: 'Amount',        value: `\`${parseFloat(trade.amount).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
    );
  }

  // Fiat total / rate (BUY/SELL)
  if (trade.fiat_amount && (trade.direction === 'BUY' || trade.direction === 'SELL')) {
    embed.addFields(
      { name: 'Fiat Total', value: `\`${parseFloat(trade.fiat_amount).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
    );
    if (trade.rate) {
      embed.addFields(
        { name: 'Rate', value: `\`1 ${trade.asset} = ${parseFloat(trade.rate).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
      );
    }
  }

  // User note
  if (trade.user_note) {
    embed.addFields({ name: 'Note', value: trade.user_note, inline: false });
  }

  if (exchangerUsername) {
    embed.addFields({ name: 'Exchanger', value: `@${exchangerUsername}`, inline: true });
  }

  if (trade.tx_id) {
    embed.addFields({ name: 'TX ID', value: `\`${trade.tx_id}\``, inline: false });
  }

  embed.setTimestamp(trade.created_at);
  return embed;
}

// ---------------------------------------------------------------------------
// Fiat payment instructions embed (shown after exchanger claims)
// ---------------------------------------------------------------------------

export function buildFiatInstructionsEmbed(trade: DbTrade, exchangerUsername: string): EmbedBuilder {
  const method = fiatMethodLabel(trade.fiat_method);
  const isF2F  = trade.direction === 'FIAT_TO_FIAT';
  const isSwap = trade.direction === 'SWAP';

  const lines = [
    isSwap
      ? `Please send **${parseFloat(trade.amount).toFixed(8)} ${trade.asset}** to the exchanger's deposit address.`
      : isF2F
        ? `Please send your payment via **${method}** to the exchanger.`
        : `Please send payment via **${method}** to the exchanger.`,
    '',
    'The exchanger will share their payment details in this channel.',
    '',
    "Once you have sent, click **I've Sent Payment** below.",
    '',
    '**Do not click the button before you have actually sent.**',
  ];

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('Payment Instructions')
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Exchanger', value: `@${exchangerUsername}`, inline: true },
    );

  if (isSwap) {
    embed.addFields(
      { name: 'You send',    value: `${parseFloat(trade.amount).toFixed(8)} ${trade.asset}`,          inline: true },
      { name: 'You receive', value: trade.swap_to_asset ?? '—', inline: true },
    );
  } else if (isF2F) {
    embed.addFields(
      { name: 'You send via',    value: fiatMethodLabel(trade.fiat_method), inline: true },
      { name: 'You receive via', value: trade.fiat_to_method ? fiatMethodLabel(trade.fiat_to_method) : '—', inline: true },
      { name: 'Amount',          value: `${parseFloat(trade.amount).toFixed(2)} ${trade.fiat_currency}`, inline: true },
    );
  } else {
    embed.addFields(
      { name: 'Asset',  value: assetLabel(trade.asset),                         inline: true },
      { name: 'Amount', value: `${parseFloat(trade.amount).toFixed(8)}`,         inline: true },
    );
  }

  embed.setTimestamp();
  return embed;
}

// ---------------------------------------------------------------------------
// Claim button row (shown on OPEN trade in #exchangers channel)
// ---------------------------------------------------------------------------

export function buildClaimRow(tradeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim:${tradeId}`)
      .setLabel('Claim Trade')
      .setStyle(ButtonStyle.Success),
  );
}

// ---------------------------------------------------------------------------
// Exchanger action row (FIAT_SENT state)
// ---------------------------------------------------------------------------

export function buildExchangerActionRow(tradeId: string, status: string): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (status === 'FIAT_SENT') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`release:${tradeId}`)
        .setLabel('Release Crypto')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`dispute:${tradeId}`)
        .setLabel('Raise Dispute')
        .setStyle(ButtonStyle.Danger),
    );
  }
  return row;
}

// ---------------------------------------------------------------------------
// User action row
// ---------------------------------------------------------------------------

export function buildUserActionRow(tradeId: string, status: string): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (status === 'FIAT_PENDING') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`fiat_sent:${tradeId}`)
        .setLabel("I've Sent Payment")
        .setStyle(ButtonStyle.Primary),
    );
  }
  if (status === 'FIAT_SENT') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`dispute:${tradeId}`)
        .setLabel('Raise Dispute')
        .setStyle(ButtonStyle.Danger),
    );
  }
  return row;
}

// ---------------------------------------------------------------------------
// Panel embed + button (deployed by /setup-panel)
// ---------------------------------------------------------------------------

export function buildPanelEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('RapidEx Exchange')
    .setDescription(
      [
        'Fast and secure crypto exchange through verified exchangers.',
        '',
        'Click **Start Exchange** and choose your trade type to open a private ticket.',
        '',
        '**Trade Types**',
        '`Buy`  — Purchase crypto with fiat',
        '`Sell` — Sell crypto for fiat',
        '`Swap` — Exchange one crypto for another',
        '`Fiat to Fiat` — Convert between fiat payment methods',
        '',
        '**Supported Crypto**',
        '`BTC`  `LTC`  `ETH`  `SOL`  `USDT`',
        '',
        '**Supported Payment Methods**',
        'Revolut · Bank Transfer · Binance Gift Card',
        'Paysafe · Apple Pay · CashApp · PayPal',
      ].join('\n'),
    )
    .setFooter({ text: 'RapidEx · Private tickets · Verified exchangers' })
    .setTimestamp();
}

export function buildPanelRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('panel:start_exchange')
      .setLabel('Start Exchange')
      .setStyle(ButtonStyle.Primary),
  );
}
