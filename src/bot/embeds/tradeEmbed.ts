/**
 * Shared embed builders for all trade-related Discord messages.
 *
 * Design principles:
 *  - Every embed has a clear header, structured fields, and a footer
 *  - Status is always visible with an icon + color
 *  - Amounts are always monospaced with full precision
 *  - Timestamps on every embed
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
// Custom server emoji
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

export function fiatMethodLabel(method: string): string {
  const MAP: Record<string, string> = {
    BANK_TRANSFER:     `${E.BANK} Bank Transfer`,
    REVOLUT:           `${E.REVOLUT} Revolut`,
    WISE:              '🏦 Wise',
    PAYPAL:            `${E.PAYPAL} PayPal`,
    CASH_IN_PERSON:    '💵 Cash in Person',
    BINANCE_GIFT_CARD: `${E.BINANCE} Binance Gift Card`,
    PAYSAFE:           `${E.PAYSAFE} Paysafe Card`,
    APPLE_PAY:         `${E.APPLE} Apple Pay`,
    CASHAPP:           `${E.CASHAPP} CashApp`,
    OTHER:             '💳 Other',
  };
  return MAP[method] ?? method.replace(/_/g, ' ');
}

export function assetLabel(asset: string): string {
  const MAP: Record<string, string> = {
    BTC:        `${E.BTC} Bitcoin (BTC)`,
    LTC:        `${E.LTC} Litecoin (LTC)`,
    ETH:        `${E.ETH} Ethereum (ETH)`,
    SOL:        `${E.SOL} Solana (SOL)`,
    USDT_BEP20: `${E.USDT} USDT (BSC)`,
    BNB:        '🟡 BNB (BSC)',
  };
  return MAP[asset] ?? asset;
}

// ---------------------------------------------------------------------------
// Status display helpers
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<string, string> = {
  OPEN:            '🟢',
  CLAIMED:         '🔵',
  FIAT_PENDING:    '🟡',
  FIAT_SENT:       '🟠',
  RELEASE_PENDING: '⏳',
  CRYPTO_SENT:     '🚀',
  COMPLETED:       '✅',
  CANCELLED:       '❌',
  DISPUTED:        '⚠️',
  EXPIRED:         '⏰',
  FAILED:          '🔴',
};

const STATUS_LABELS: Record<string, string> = {
  OPEN:            'Open — Awaiting Exchanger',
  CLAIMED:         'Claimed',
  FIAT_PENDING:    'Awaiting Payment',
  FIAT_SENT:       'Payment Sent — Awaiting Release',
  RELEASE_PENDING: 'Release Pending',
  CRYPTO_SENT:     'Crypto Sent — Awaiting Confirmation',
  COMPLETED:       'Completed',
  CANCELLED:       'Cancelled',
  DISPUTED:        'Under Dispute',
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

const DIRECTION_ICONS: Record<string, string> = {
  BUY:         '📥',
  SELL:        '📤',
  SWAP:        '🔄',
  FIAT_TO_FIAT:'💱',
};

const DIRECTION_LABELS: Record<string, string> = {
  BUY:         'Buy Crypto',
  SELL:        'Sell Crypto',
  SWAP:        'Swap Crypto',
  FIAT_TO_FIAT:'Fiat → Fiat',
};

// ---------------------------------------------------------------------------
// Main trade ticket embed
// ---------------------------------------------------------------------------

export function buildTradeEmbed(trade: DbTrade, exchangerUsername?: string): EmbedBuilder {
  const statusIcon  = STATUS_ICONS[trade.status]  ?? '❓';
  const statusLabel = STATUS_LABELS[trade.status] ?? trade.status;
  const dirIcon     = DIRECTION_ICONS[trade.direction] ?? '↔️';
  const dirLabel    = DIRECTION_LABELS[trade.direction] ?? trade.direction;
  const color       = STATUS_COLORS[trade.status] ?? COLORS.PRIMARY;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${dirIcon} RapidEx — ${dirLabel}`)
    .setDescription(
      `**Status:** ${statusIcon} ${statusLabel}\n` +
      `**Trade ID:** \`${trade.id}\``,
    );

  // ── Direction-specific trade fields ──────────────────────────────────────
  if (trade.direction === 'BUY') {
    embed.addFields(
      { name: '📦 You Receive',    value: assetLabel(trade.asset),              inline: true },
      { name: '💳 Payment Method', value: fiatMethodLabel(trade.fiat_method),   inline: true },
      { name: '🔢 Crypto Amount',  value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
    );
    if (trade.fiat_amount) {
      embed.addFields(
        { name: '💰 Fiat Total', value: `\`${parseFloat(trade.fiat_amount).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
      );
    }
    if (trade.rate) {
      embed.addFields(
        { name: '📈 Rate', value: `\`1 ${trade.asset} = ${parseFloat(trade.rate).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
      );
    }
    if (trade.fee_amount && trade.fee_percentage_snapshot) {
      embed.addFields(
        { name: '🏷️ Fee', value: `\`${parseFloat(trade.fee_amount).toFixed(8)} ${trade.asset} (${trade.fee_percentage_snapshot}%)\``, inline: true },
      );
    }
  } else if (trade.direction === 'SELL') {
    embed.addFields(
      { name: '📦 You Send',       value: assetLabel(trade.asset),              inline: true },
      { name: '💳 Receive Via',    value: fiatMethodLabel(trade.fiat_method),   inline: true },
      { name: '🔢 Crypto Amount',  value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
    );
    if (trade.fiat_amount) {
      embed.addFields(
        { name: '💰 Fiat Total', value: `\`${parseFloat(trade.fiat_amount).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
      );
    }
    if (trade.rate) {
      embed.addFields(
        { name: '📈 Rate', value: `\`1 ${trade.asset} = ${parseFloat(trade.rate).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
      );
    }
  } else if (trade.direction === 'SWAP') {
    embed.addFields(
      { name: '📤 You Send',    value: assetLabel(trade.asset),                                              inline: true },
      { name: '📥 You Receive', value: trade.swap_to_asset ? assetLabel(trade.swap_to_asset) : '—',         inline: true },
      { name: '🔢 Amount',      value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``,          inline: true },
    );
  } else if (trade.direction === 'FIAT_TO_FIAT') {
    embed.addFields(
      { name: '📤 Send Via',    value: fiatMethodLabel(trade.fiat_method),                                   inline: true },
      { name: '📥 Receive Via', value: trade.fiat_to_method ? fiatMethodLabel(trade.fiat_to_method) : '—',  inline: true },
      { name: '💰 Amount',      value: `\`${parseFloat(trade.amount).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
    );
  }

  // ── Optional fields ───────────────────────────────────────────────────────
  if (exchangerUsername) {
    embed.addFields({ name: '🤝 Exchanger', value: `@${exchangerUsername}`, inline: true });
  }

  if (trade.user_wallet_address) {
    embed.addFields({ name: '📬 Destination Wallet', value: `\`${trade.user_wallet_address}\``, inline: false });
  }

  if (trade.tx_id) {
    embed.addFields({ name: '🔗 Transaction ID', value: `\`${trade.tx_id}\``, inline: false });
  }

  if (trade.user_note) {
    embed.addFields({ name: '📝 Buyer Note', value: trade.user_note, inline: false });
  }

  if (trade.expires_at && trade.status === 'OPEN') {
    embed.addFields({ name: '⏱️ Expires', value: `<t:${Math.floor(new Date(trade.expires_at).getTime() / 1000)}:R>`, inline: true });
  }

  embed
    .setFooter({ text: `RapidEx · Secure P2P Exchange · Trade opened` })
    .setTimestamp(trade.created_at);

  return embed;
}

// ---------------------------------------------------------------------------
// Fiat payment instructions embed (shown to user after exchanger claims)
// ---------------------------------------------------------------------------

export function buildFiatInstructionsEmbed(trade: DbTrade, exchangerUsername: string): EmbedBuilder {
  const isSwap = trade.direction === 'SWAP';
  const isF2F  = trade.direction === 'FIAT_TO_FIAT';
  const isBuy  = trade.direction === 'BUY';

  let instructions: string;

  if (isSwap) {
    instructions =
      `Send **\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\`** to the exchanger's deposit address.\n\n` +
      `The exchanger will share their wallet address here momentarily.\n\n` +
      `Once you've sent, click **✅ I've Sent Payment** below.`;
  } else if (isF2F) {
    instructions =
      `Transfer via **${fiatMethodLabel(trade.fiat_method)}** to the exchanger.\n\n` +
      `The exchanger will share their payment details here momentarily.\n\n` +
      `Once you've sent, click **✅ I've Sent Payment** below.`;
  } else if (isBuy) {
    instructions =
      `Pay **\`${trade.fiat_amount ? parseFloat(trade.fiat_amount).toFixed(2) : '?'} ${trade.fiat_currency}\`** via **${fiatMethodLabel(trade.fiat_method)}** to the exchanger.\n\n` +
      `The exchanger will share their payment details here momentarily.\n\n` +
      `Once you've sent the full amount, click **✅ I've Sent Payment** below.\n\n` +
      `⚠️ **Do not click the button before you have actually sent.**`;
  } else {
    // SELL
    instructions =
      `Provide your **${fiatMethodLabel(trade.fiat_method)}** details to the exchanger so they can send your fiat payment.\n\n` +
      `Once payment is confirmed by the exchanger, your crypto will be released.\n\n` +
      `Click **✅ I've Sent Payment** once the exchanger confirms they have sent.`;
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('📋 Payment Instructions')
    .setDescription(instructions);

  embed.addFields(
    { name: '🤝 Exchanger', value: `@${exchangerUsername}`, inline: true },
    { name: '📊 Status',    value: `${STATUS_ICONS.FIAT_PENDING} Awaiting Your Payment`, inline: true },
  );

  if (isSwap) {
    embed.addFields(
      { name: '📤 You Send',    value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
      { name: '📥 You Receive', value: trade.swap_to_asset ? assetLabel(trade.swap_to_asset) : '—', inline: true },
    );
  } else if (isF2F) {
    embed.addFields(
      { name: '📤 Send Via',    value: fiatMethodLabel(trade.fiat_method), inline: true },
      { name: '📥 Receive Via', value: trade.fiat_to_method ? fiatMethodLabel(trade.fiat_to_method) : '—', inline: true },
      { name: '💰 Amount',      value: `\`${parseFloat(trade.amount).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
    );
  } else {
    embed.addFields(
      { name: '💎 Asset',  value: assetLabel(trade.asset), inline: true },
      { name: '🔢 Amount', value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
    );
    if (trade.fiat_amount) {
      embed.addFields(
        { name: '💰 Fiat Total', value: `\`${parseFloat(trade.fiat_amount).toFixed(2)} ${trade.fiat_currency}\``, inline: true },
      );
    }
  }

  embed
    .setFooter({ text: 'Never send payment before verifying exchanger details' })
    .setTimestamp();

  return embed;
}

// ---------------------------------------------------------------------------
// Terms & Conditions embed (shown to buyer when exchanger has T&C)
// ---------------------------------------------------------------------------

export function buildTermsEmbed(params: {
  terms: string;
  exchangerUsername: string;
  tradeId: string;
  exchangerId: string;
}): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const { terms, exchangerUsername, tradeId, exchangerId } = params;

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('📜 Exchanger Terms & Conditions')
    .setDescription(
      `**@${exchangerUsername}** requires you to accept their Terms & Conditions before claiming your trade.\n\n` +
      `─────────────────────────────\n` +
      terms.slice(0, 1800) +
      `\n─────────────────────────────\n\n` +
      `By clicking **✅ Accept**, you agree to the above terms and allow the exchanger to proceed with your trade.`,
    )
    .setFooter({ text: 'Declining will not affect your trade — another exchanger may still claim it' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`terms_accept:${tradeId}:${exchangerId}`)
      .setLabel('✅ Accept Terms')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`terms_decline:${tradeId}`)
      .setLabel('❌ Decline')
      .setStyle(ButtonStyle.Danger),
  );

  return { embed, row };
}

// ---------------------------------------------------------------------------
// Release method selection embed (shown to exchanger after buyer marks paid)
// ---------------------------------------------------------------------------

export function buildReleaseMethodRow(tradeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`release_internal:${tradeId}`)
      .setLabel('🏦 Internal Wallet')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`release_external:${tradeId}`)
      .setLabel('📤 External / Manual')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`dispute:${tradeId}`)
      .setLabel('⚠️ Dispute')
      .setStyle(ButtonStyle.Danger),
  );
}

// ---------------------------------------------------------------------------
// External payment check embed (bot asks buyer if they received payment)
// ---------------------------------------------------------------------------

export function buildExternalPaymentCheckEmbed(
  trade: DbTrade,
  exchangerUsername: string,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const embed = new EmbedBuilder()
    .setColor(COLORS.ESCROW)
    .setTitle('📤 External Payment — Confirm Receipt')
    .setDescription(
      `**@${exchangerUsername}** has marked this trade as paid via **external / manual transfer**.\n\n` +
      `Please confirm below whether you have received the payment.\n\n` +
      `> ✅ **Yes, I received it** — trade will be marked complete and escrow released\n` +
      `> ❌ **No, I haven't received it** — a dispute will be opened for admin review`,
    )
    .addFields(
      { name: '💎 Asset',      value: assetLabel(trade.asset),                                     inline: true },
      { name: '🔢 Amount',     value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
      { name: '🤝 Exchanger',  value: `@${exchangerUsername}`,                                     inline: true },
      { name: '🆔 Trade ID',   value: `\`${trade.id}\``,                                          inline: false },
    )
    .setFooter({ text: 'Only confirm receipt if you have actually received the funds' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ext_received:${trade.id}`)
      .setLabel('✅ Yes, I Received It')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ext_not_received:${trade.id}`)
      .setLabel('❌ No, I Haven\'t Received It')
      .setStyle(ButtonStyle.Danger),
  );

  return { embed, row };
}

// ---------------------------------------------------------------------------
// Claim button row (on OPEN trade in forum / ticket)
// ---------------------------------------------------------------------------

export function buildClaimRow(tradeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim:${tradeId}`)
      .setLabel('🤝 Claim Trade')
      .setStyle(ButtonStyle.Success),
  );
}

// ---------------------------------------------------------------------------
// Exchanger action row — kept for backwards compat / admin views
// (replaced in main flow by buildReleaseMethodRow)
// ---------------------------------------------------------------------------

export function buildExchangerActionRow(tradeId: string, status: string): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (status === 'FIAT_SENT') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`release_internal:${tradeId}`)
        .setLabel('🏦 Release — Internal Wallet')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`release_external:${tradeId}`)
        .setLabel('📤 Release — External / Manual')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`dispute:${tradeId}`)
        .setLabel('⚠️ Dispute')
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
        .setLabel('✅ I\'ve Sent Payment')
        .setStyle(ButtonStyle.Primary),
    );
  }
  if (status === 'FIAT_SENT') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`dispute:${tradeId}`)
        .setLabel('⚠️ Raise Dispute')
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
    .setTitle('⚡ RapidEx — P2P Crypto Exchange')
    .setDescription(
      [
        '> Fast, secure, and private crypto exchange powered by verified exchangers.',
        '',
        '**How it works**',
        '`1.` Click **Start Exchange** and choose your trade type',
        '`2.` Fill in the amount — we\'ll lock a live rate for 5 minutes',
        '`3.` A verified exchanger claims your ticket in a private channel',
        '`4.` Complete the payment and receive your crypto',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        '**Trade Types**',
        `📥 **Buy**  — Purchase crypto with fiat`,
        `📤 **Sell** — Sell crypto for fiat`,
        `🔄 **Swap** — Exchange one crypto for another`,
        `💱 **Fiat → Fiat** — Convert between payment methods`,
        '',
        '**Supported Crypto**',
        `${E.BTC} BTC  ${E.LTC} LTC  ${E.ETH} ETH  ${E.SOL} SOL  ${E.USDT} USDT`,
        '',
        '**Supported Payment Methods**',
        `${E.REVOLUT} Revolut  ${E.BANK} Bank Transfer  ${E.BINANCE} Binance Gift Card`,
        `${E.PAYSAFE} Paysafe  ${E.APPLE} Apple Pay  ${E.CASHAPP} CashApp  ${E.PAYPAL} PayPal`,
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        '🔒 All trades are escrow-protected · 🤝 Verified exchangers only',
      ].join('\n'),
    )
    .setFooter({ text: 'RapidEx · Private Tickets · Verified Exchangers · Escrow Protected' })
    .setTimestamp();
}

export function buildPanelRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('panel:start_exchange')
      .setLabel('⚡ Start Exchange')
      .setStyle(ButtonStyle.Primary),
  );
}
