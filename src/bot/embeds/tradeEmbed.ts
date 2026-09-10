/**
 * Shared embed builders for all trade-related Discord messages.
 *
 * Design principles:
 *  - Fiat amount is always the primary display (what you pay/receive in fiat)
 *  - Crypto amount is secondary context
 *  - Fees expressed in fiat
 *  - Orange & black brand theme throughout
 *  - Server icon on panel embed thumbnail
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { COLORS, BANNER_URL } from './colors';
import type { DbTrade } from '../../types';

// ---------------------------------------------------------------------------
// Custom server emoji
// ---------------------------------------------------------------------------

const E = {
  BTC:      '<:1425bitcoin:1546527437406343299>',
  LTC:      '<:2625crypto:1546528103176601712>',
  ETH:      '<:3031ethereum:1546527560328941669>',
  SOL:      '<:19845solana:1546527612694831184>',
  USDT:     '<:7541tetherusdt:1546527696937291796>',
  REVOLUT:  '<:6383revolut:1546528170130407564>',
  BANK:     '<:bank:1546528985406636113>',
  BINANCE:  '<:Binance:1546528855886659678>',
  PAYSAFE:  '<:3459paysafecard:1546531852414623774>',
  APPLE:    '<:9823applepaylogo:1546528385470304276>',
  CASHAPP:  '<:55778cashapp:1546528307242340462>',
  PAYPAL:   '<:51891paypal:1546528262531059825>',
  DEBTCARD: '<:DebtCard:1547332209684381756>',
  LOCK:     '<:lock:1547331951877165128>',
  ARROW:    '<:Arrow:1547330759571017768>',
  BUY:      '<:emojigg_Buy:1547330997002043404>',
  CHECK:    '<:GreenCheckmark:1547332810048667659>',
  NO:       '<:emojigg_no:1547332976201830441>',
} as const;

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

export function fiatMethodLabel(method: string): string {
  const MAP: Record<string, string> = {
    BANK_TRANSFER:     `${E.BANK} Bank Transfer`,
    REVOLUT:           `${E.REVOLUT} Revolut`,
    WISE:              `${E.DEBTCARD} Wise`,
    PAYPAL:            `${E.PAYPAL} PayPal`,
    CASH_IN_PERSON:    `${E.DEBTCARD} Cash in Person`,
    BINANCE_GIFT_CARD: `${E.BINANCE} Binance Gift Card`,
    PAYSAFE:           `${E.PAYSAFE} Paysafe Card`,
    APPLE_PAY:         `${E.APPLE} Apple Pay`,
    CASHAPP:           `${E.CASHAPP} CashApp`,
    OTHER:             `${E.DEBTCARD} Other`,
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
    BNB:        `${E.ARROW} BNB (BSC)`,
  };
  return MAP[asset] ?? asset;
}

// ---------------------------------------------------------------------------
// Fiat helpers
// ---------------------------------------------------------------------------

/** Format a fiat amount + currency symbol, e.g. "€ 250.00" */
function fiatDisplay(amount: string, currency: string): string {
  const SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };
  const sym = SYMBOLS[currency] ?? currency;
  return `${sym}${parseFloat(amount).toFixed(2)}`;
}

/**
 * Compute fee in fiat: feeAmount (crypto) × rate → fiat.
 * Returns null if rate is unavailable.
 */
function feeInFiat(
  feeAmount: string | null,
  rate: string | null,
  currency: string,
  feePercentage: string | null,
): string | null {
  if (!feeAmount || !rate) return null;
  const fiatFee = parseFloat(feeAmount) * parseFloat(rate);
  const pct = feePercentage ? ` (${feePercentage}%)` : '';
  const SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };
  const sym = SYMBOLS[currency] ?? currency;
  return `${sym}${fiatFee.toFixed(2)}${pct}`;
}

// ---------------------------------------------------------------------------
// Status display helpers
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<string, string> = {
  OPEN:            `${E.ARROW}`,
  CLAIMED:         `${E.BUY}`,
  FIAT_PENDING:    `${E.DEBTCARD}`,
  FIAT_SENT:       `${E.ARROW}`,
  RELEASE_PENDING: `${E.LOCK}`,
  CRYPTO_SENT:     `${E.ARROW}`,
  COMPLETED:       `${E.CHECK}`,
  CANCELLED:       `${E.NO}`,
  DISPUTED:        `${E.NO}`,
  EXPIRED:         `${E.NO}`,
  FAILED:          `${E.NO}`,
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
  BUY:          `${E.BUY}`,
  SELL:         `${E.ARROW}`,
  SWAP:         `${E.ARROW}`,
  FIAT_TO_FIAT: `${E.DEBTCARD}`,
};

const DIRECTION_LABELS: Record<string, string> = {
  BUY:         'Buy Crypto',
  SELL:        'Sell Crypto',
  SWAP:        'Swap Crypto',
  FIAT_TO_FIAT:'Fiat → Fiat',
};

// ---------------------------------------------------------------------------
// Main trade ticket embed  (fiat-first)
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
      `${statusIcon} **${statusLabel}**\n` +
      `\`\`\`${trade.id}\`\`\``,
    );

  // ── BUY: user pays fiat, receives crypto ──────────────────────────────────
  if (trade.direction === 'BUY') {
    // Primary: fiat amount they pay
    if (trade.fiat_amount) {
      embed.addFields({
        name:   `${E.DEBTCARD} You Pay`,
        value:  `\`${fiatDisplay(trade.fiat_amount, trade.fiat_currency)}\``,
        inline: true,
      });
    } else {
      embed.addFields({ name: `${E.DEBTCARD} You Pay`, value: `\`? ${trade.fiat_currency}\``, inline: true });
    }
    // Secondary: crypto they receive
    embed.addFields(
      { name: `${E.BUY} You Receive`,      value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
      { name: `${E.DEBTCARD} Payment Method`, value: fiatMethodLabel(trade.fiat_method),                       inline: true },
    );
    // Fee in fiat
    const fee = feeInFiat(trade.fee_amount, trade.rate, trade.fiat_currency, trade.fee_percentage_snapshot);
    if (fee) {
      embed.addFields({ name: `${E.ARROW} Fee`, value: `\`${fee}\``, inline: true });
    }
  }

  // ── SELL: user sends crypto, receives fiat ────────────────────────────────
  else if (trade.direction === 'SELL') {
    // Primary: fiat they receive
    if (trade.fiat_amount) {
      embed.addFields({
        name:   `${E.DEBTCARD} You Receive`,
        value:  `\`${fiatDisplay(trade.fiat_amount, trade.fiat_currency)}\``,
        inline: true,
      });
    } else {
      embed.addFields({ name: `${E.DEBTCARD} You Receive`, value: `\`? ${trade.fiat_currency}\``, inline: true });
    }
    // Secondary: crypto they send
    embed.addFields(
      { name: `${E.ARROW} You Send`,      value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
      { name: `${E.DEBTCARD} Receive Via`, value: fiatMethodLabel(trade.fiat_method),                         inline: true },
    );
    const fee = feeInFiat(trade.fee_amount, trade.rate, trade.fiat_currency, trade.fee_percentage_snapshot);
    if (fee) {
      embed.addFields({ name: `${E.ARROW} Fee`, value: `\`${fee}\``, inline: true });
    }
  }

  // ── SWAP: crypto → crypto ─────────────────────────────────────────────────
  else if (trade.direction === 'SWAP') {
    embed.addFields(
      { name: `${E.ARROW} You Send`,    value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``,      inline: true },
      { name: `${E.BUY} You Receive`,   value: trade.swap_to_asset ? assetLabel(trade.swap_to_asset) : '—',      inline: true },
      { name: `${E.ARROW} Network`,     value: assetLabel(trade.asset),                                           inline: true },
    );
  }

  // ── FIAT → FIAT ───────────────────────────────────────────────────────────
  else if (trade.direction === 'FIAT_TO_FIAT') {
    embed.addFields(
      { name: `${E.DEBTCARD} Fiat Amount`, value: `\`${fiatDisplay(trade.fiat_amount ?? trade.amount, trade.fiat_currency)}\``, inline: true },
      { name: `${E.LOCK} Collateral`,      value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``,            inline: true },
      { name: `${E.ARROW} Send Via`,     value: fiatMethodLabel(trade.fiat_method),                               inline: true },
      { name: `${E.BUY} Receive Via`,    value: trade.fiat_to_method ? fiatMethodLabel(trade.fiat_to_method) : '—', inline: true },
    );
  }

  // ── Optional supplemental fields ─────────────────────────────────────────
  if (exchangerUsername) {
    embed.addFields({ name: `${E.CHECK} Exchanger`, value: `@${exchangerUsername}`, inline: true });
  }

  if (trade.user_wallet_address) {
    embed.addFields({ name: `${E.ARROW} Destination Wallet`, value: `\`${trade.user_wallet_address}\``, inline: false });
  }

  if (trade.tx_id) {
    embed.addFields({ name: `${E.ARROW} Transaction`, value: `\`${trade.tx_id}\``, inline: false });
  }

  if (trade.user_note) {
    embed.addFields({ name: `${E.ARROW} Note`, value: trade.user_note, inline: false });
  }

  if (trade.expires_at && trade.status === 'OPEN') {
    embed.addFields({
      name:   `${E.ARROW} Expires`,
      value:  `<t:${Math.floor(new Date(trade.expires_at).getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  embed
    .setFooter({ text: 'RapidEx · Secure P2P Exchange' })
    .setTimestamp(trade.created_at);

  return embed;
}

// ---------------------------------------------------------------------------
// Fiat payment instructions embed (fiat-first)
// ---------------------------------------------------------------------------

export function buildFiatInstructionsEmbed(trade: DbTrade, exchangerUsername: string): EmbedBuilder {
  const isSwap = trade.direction === 'SWAP';
  const isF2F  = trade.direction === 'FIAT_TO_FIAT';
  const isBuy  = trade.direction === 'BUY';

  // Build the primary amount string (fiat when available, else crypto)
  const primaryAmount = (!isSwap && (trade.fiat_amount || isF2F))
    ? `**\`${fiatDisplay(trade.fiat_amount ?? trade.amount, trade.fiat_currency)}\`**`
    : `**\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\`**`;

  let instructions: string;

  if (isSwap) {
    instructions =
      `Send **\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\`** to the exchanger's wallet address.\n\n` +
      `The exchanger will share their deposit address in this channel shortly.\n\n` +
      `Once sent, click **${E.CHECK} I've Sent Payment** below.\n\n` +
      `${E.NO} **Only click after you have sent the funds.**`;
  } else if (isF2F) {
    instructions =
      `Send ${primaryAmount} via **${fiatMethodLabel(trade.fiat_method)}** to the exchanger.\n\n` +
      `The exchanger will share their payment details in this channel shortly.\n\n` +
      `Once sent, click **${E.CHECK} I've Sent Payment** below.`;
  } else if (isBuy) {
    instructions =
      `Pay ${primaryAmount} via **${fiatMethodLabel(trade.fiat_method)}** to the exchanger.\n\n` +
      `The exchanger will share their payment details in this channel shortly.\n\n` +
      `Once you have sent the **full amount**, click **${E.CHECK} I've Sent Payment** below.\n\n` +
      `${E.NO} **Do not click the button before you have actually sent.**`;
  } else {
    // SELL — user sends crypto, exchanger sends fiat
    instructions =
      `Share your **${fiatMethodLabel(trade.fiat_method)}** details with the exchanger so they can send your fiat.\n\n` +
      `You will receive ${primaryAmount}.\n\n` +
      `Once the exchanger confirms they have sent, click **${E.CHECK} I've Sent Payment**.`;
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle(`${E.DEBTCARD} Payment Instructions`)
    .setDescription(instructions);

  embed.addFields(
    { name: `${E.CHECK} Exchanger`, value: `@${exchangerUsername}`,                              inline: true },
    { name: `${E.ARROW} Status`,    value: `${STATUS_ICONS.FIAT_PENDING} Awaiting Payment`,       inline: true },
  );

  // Summary fields — fiat first
  if (!isSwap && !isF2F) {
    if (trade.fiat_amount) {
      embed.addFields({ name: isBuy ? `${E.DEBTCARD} You Pay` : `${E.DEBTCARD} You Receive`, value: `\`${fiatDisplay(trade.fiat_amount, trade.fiat_currency)}\``, inline: true });
    }
    embed.addFields({ name: `${E.ARROW} Asset`, value: assetLabel(trade.asset), inline: true });
    // Fee in fiat
    const fee = feeInFiat(trade.fee_amount, trade.rate, trade.fiat_currency, trade.fee_percentage_snapshot);
    if (fee) {
      embed.addFields({ name: `${E.ARROW} Fee`, value: `\`${fee}\``, inline: true });
    }
  } else if (isSwap) {
    embed.addFields(
      { name: `${E.ARROW} You Send`,    value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``,             inline: true },
      { name: `${E.BUY} You Receive`,   value: trade.swap_to_asset ? assetLabel(trade.swap_to_asset) : '—',             inline: true },
    );
  } else {
    // F2F
    embed.addFields(
      { name: `${E.DEBTCARD} Fiat Amount`, value: `\`${fiatDisplay(trade.fiat_amount ?? trade.amount, trade.fiat_currency)}\``, inline: true },
      { name: `${E.LOCK} Collateral`,      value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``,            inline: true },
      { name: `${E.ARROW} Send Via`,    value: fiatMethodLabel(trade.fiat_method),                                       inline: true },
      { name: `${E.BUY} Receive Via`,   value: trade.fiat_to_method ? fiatMethodLabel(trade.fiat_to_method) : '—',      inline: true },
    );
  }

  embed
    .setFooter({ text: 'Never send payment before verifying the exchanger\'s details' })
    .setTimestamp();

  return embed;
}

// ---------------------------------------------------------------------------
// Terms & Conditions embed
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
    .setTitle(`${E.LOCK} Exchanger Terms & Conditions`)
    .setDescription(
      `**@${exchangerUsername}** requires you to accept their Terms & Conditions before this trade can proceed.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      terms.slice(0, 1800) +
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `By clicking **${E.CHECK} Accept Terms**, you agree to the above and allow this exchanger to proceed.`,
    )
    .setFooter({ text: 'Declining won\'t cancel your trade — another exchanger may still claim it' })
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
// Release method row (shown to exchanger after buyer marks fiat sent)
// ---------------------------------------------------------------------------

export function buildReleaseMethodRow(
  tradeId: string,
  includeInternalWallet = true,
): ActionRowBuilder<ButtonBuilder> {
  const buttons = [] as ButtonBuilder[];

  if (includeInternalWallet) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`release_internal:${tradeId}`)
        .setLabel('Internal Wallet')
        .setStyle(ButtonStyle.Success),
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`release_external:${tradeId}`)
      .setLabel('External / Manual')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`dispute:${tradeId}`)
      .setLabel('Dispute')
      .setStyle(ButtonStyle.Danger),
  );

  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

export function buildExternalPaymentCheckEmbed(
  trade: DbTrade,
  exchangerUsername: string,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  // Primary amount: fiat when available
  const amountStr = trade.direction === 'FIAT_TO_FIAT'
    ? `\`${fiatDisplay(trade.fiat_amount ?? trade.amount, trade.fiat_currency)}\` (collateral: \`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\`)`
    : trade.fiat_amount
    ? `\`${fiatDisplay(trade.fiat_amount, trade.fiat_currency)}\` (≈ \`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\`)`
    : `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``;

  const embed = new EmbedBuilder()
    .setColor(COLORS.ESCROW)
    .setTitle(`${E.ARROW} External Payment — Confirm Receipt`)
    .setDescription(
      `**@${exchangerUsername}** has marked this trade as paid via **external / manual transfer**.\n\n` +
      `Please confirm whether you have received the payment:\n\n` +
      `> ${E.CHECK} **Yes, I received it** — trade completes and escrow is released\n` +
      `> ${E.NO} **No, I haven't received it** — a dispute is opened for admin review`,
    )
    .addFields(
      { name: `${E.DEBTCARD} Amount`,    value: amountStr,              inline: false },
      { name: `${E.CHECK} Exchanger`,    value: `@${exchangerUsername}`, inline: true  },
      { name: `${E.ARROW} Trade ID`,     value: `\`${trade.id}\``,       inline: true  },
    )
    .setFooter({ text: 'Only confirm if you have actually received the funds' })
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
// Claim button row
// ---------------------------------------------------------------------------

export function buildClaimRow(tradeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim:${tradeId}`)
      .setLabel('Claim Trade')
      .setStyle(ButtonStyle.Success),
  );
}

export function buildExchangerActionRow(tradeId: string, status: string): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (status === 'FIAT_SENT') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`release_internal:${tradeId}`)
        .setLabel('Release — Internal Wallet')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`release_external:${tradeId}`)
        .setLabel('Release — External / Manual')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`dispute:${tradeId}`)
        .setLabel('Dispute')
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
// Panel embed — accepts optional guild icon URL for thumbnail
// ---------------------------------------------------------------------------

export function buildPanelEmbed(guildIconUrl?: string | null): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`${E.ARROW} RapidEx — P2P Crypto Exchange`)
    .setDescription(
      [
        '> Fast, secure, and private crypto exchange powered by verified exchangers.',
        '',
        '**How It Works**',
        `\`1.\` Click **Start Exchange** and choose your trade type`,
        `\`2.\` Enter the **fiat amount** — a live rate locks for 5 minutes`,
        `\`3.\` A verified exchanger claims your private ticket`,
        `\`4.\` Complete the payment and receive your crypto`,
        '',
        '**Trade Types**',
        `${E.BUY} **Buy**  — Spend fiat, receive crypto`,
        `${E.ARROW} **Sell** — Send crypto, receive fiat`,
        `${E.ARROW} **Swap** — Exchange one crypto for another`,
        `${E.DEBTCARD} **Fiat → Fiat** — Convert between payment methods`,
        '',
        `${E.LOCK} Escrow-protected  ·  ${E.CHECK} Verified exchangers only  ·  ${E.ARROW} Instant tickets`,
      ].join('\n'),
    )
    .setFooter({ text: 'RapidEx · Private Tickets · Verified Exchangers · Escrow Protected' })
    .setTimestamp()
    .setImage(BANNER_URL);

  if (guildIconUrl) {
    embed.setThumbnail(guildIconUrl);
  }

  return embed;
}

export function buildPanelRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('panel:start_exchange')
      .setLabel('⚡ Start Exchange')
      .setStyle(ButtonStyle.Primary),
  );
}
