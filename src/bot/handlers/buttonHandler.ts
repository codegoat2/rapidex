/**
 * Button & Select Menu Handler
 *
 * Panel flow (all ephemeral, state passed through customId):
 *
 *   panel:start_exchange
 *     → select menu  panel:direction
 *         BUY  → select menu  panel:buy_crypto
 *                  → select menu  panel:buy_method:<crypto>
 *                       → modal  trade_modal:BUY:<crypto>:<method>
 *
 *         SELL → select menu  panel:sell_crypto
 *                  → select menu  panel:sell_method:<crypto>
 *                       → modal  trade_modal:SELL:<crypto>:<method>
 *
 *         SWAP → select menu  panel:swap_from
 *                  → select menu  panel:swap_to:<fromCrypto>
 *                       → modal  trade_modal:SWAP:<fromCrypto>:<toCrypto>
 *
 *         F2F  → select menu  panel:f2f_from
 *                  → select menu  panel:f2f_to:<fromMethod>
 *                       → modal  trade_modal:FIAT_TO_FIAT:<fromMethod>:<toMethod>
 *
 * Trade lifecycle buttons:
 *   claim:<tradeId>
 *   fiat_sent:<tradeId>
 *   release:<tradeId>
 *   dispute:<tradeId>
 *   admin_force_release:<tradeId>
 *   admin_force_cancel:<tradeId>
 *   confirm_force_release:<tradeId>
 *   confirm_force_cancel:<tradeId>
 *   quote_confirm:<quoteId>
 *   quote_cancel:<quoteId>
 */

import {
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { logger } from '../../utils/logger';

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
  VENMO:   '<:29806venmo:1546528223695741059>',
} as const;

// ---------------------------------------------------------------------------
// Static option lists
// ---------------------------------------------------------------------------

const CRYPTO_OPTIONS = [
  { label: 'Bitcoin',       description: 'BTC',  value: 'BTC',        emoji: E.BTC   },
  { label: 'Litecoin',      description: 'LTC',  value: 'LTC',        emoji: E.LTC   },
  { label: 'Ethereum',      description: 'ETH',  value: 'ETH',        emoji: E.ETH   },
  { label: 'Solana',        description: 'SOL',  value: 'SOL',        emoji: E.SOL   },
  { label: 'Tether (USDT)', description: 'BSC',  value: 'USDT_BEP20', emoji: E.USDT  },
] as const;

const FIAT_OPTIONS = [
  { label: 'Revolut',           value: 'REVOLUT',           emoji: E.REVOLUT },
  { label: 'Bank Transfer',     value: 'BANK_TRANSFER',     emoji: E.BANK    },
  { label: 'Binance Gift Card', value: 'BINANCE_GIFT_CARD', emoji: E.BINANCE },
  { label: 'Paysafe Card',      value: 'PAYSAFE',           emoji: E.PAYSAFE },
  { label: 'Apple Pay',         value: 'APPLE_PAY',         emoji: E.APPLE   },
  { label: 'CashApp',           value: 'CASHAPP',           emoji: E.CASHAPP },
  { label: 'PayPal',            value: 'PAYPAL',            emoji: E.PAYPAL  },
] as const;

function cryptoSelect(customId: string, placeholder: string): StringSelectMenuBuilder {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1);
  for (const o of CRYPTO_OPTIONS) {
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(o.label)
        .setDescription(o.description)
        .setValue(o.value)
        .setEmoji(o.emoji),
    );
  }
  return menu;
}

function fiatSelect(customId: string, placeholder: string, exclude?: string): StringSelectMenuBuilder {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1);
  for (const o of FIAT_OPTIONS) {
    if (o.value === exclude) continue;
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(o.label)
        .setValue(o.value)
        .setEmoji(o.emoji),
    );
  }
  return menu;
}

// ---------------------------------------------------------------------------
// Button router
// ---------------------------------------------------------------------------

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [action, ...rest] = interaction.customId.split(':');
  const id = rest.join(':');

  try {
    switch (action) {
      case 'panel':
        if (id === 'start_exchange') await handleStartExchange(interaction);
        break;
      case 'claim':
        await (await import('./tradeFlowHandler')).handleClaim(interaction, id);
        break;
      case 'fiat_sent':
        await (await import('./tradeFlowHandler')).handleFiatSent(interaction, id);
        break;
      case 'release':
        await handleReleaseButton(interaction, id);
        break;
      case 'dispute':
        await (await import('./tradeFlowHandler')).handleDispute(interaction, id);
        break;
      case 'admin_force_release':
        await (await import('./tradeFlowHandler')).handleForceReleaseConfirm(interaction, id);
        break;
      case 'admin_force_cancel':
        await (await import('./tradeFlowHandler')).handleForceCancelConfirm(interaction, id);
        break;
      case 'confirm_force_release':
        await (await import('./tradeFlowHandler')).handleForceRelease(interaction, id);
        break;
      case 'confirm_force_cancel':
        await (await import('./tradeFlowHandler')).handleForceCancel(interaction, id);
        break;
      case 'quote_confirm':
        await (await import('./modalHandler')).handleQuoteConfirmation(interaction, id);
        break;
      case 'quote_cancel':
        await interaction.update({
          content: 'Quote cancelled. Start a new exchange from the panel.',
          embeds: [],
          components: [],
        });
        break;
      default:
        logger.warn({ customId: interaction.customId }, 'Unknown button action');
        await interaction.reply({ content: 'Unknown action.', ephemeral: true });
    }
  } catch (err) {
    logger.error({ err, customId: interaction.customId }, 'Button handler error');
    try {
      const msg = 'Something went wrong. Please try again.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    } catch { /* timed out */ }
  }
}

// ---------------------------------------------------------------------------
// Select menu router
// ---------------------------------------------------------------------------

export async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const [ns, step, ...ctx] = parts;

  if (ns !== 'panel') {
    logger.warn({ customId: interaction.customId }, 'Unknown select menu');
    await interaction.reply({ content: 'Unknown menu.', ephemeral: true });
    return;
  }

  try {
    switch (step) {

      // ── Step 1: direction chosen ─────────────────────────────────────────
      case 'direction': {
        const direction = interaction.values[0]!;
        switch (direction) {
          case 'BUY':
            await interaction.update({
              content: '**Step 2 of 3** — Which crypto do you want to **receive**?',
              components: [row(cryptoSelect('panel:buy_crypto', 'Select crypto to receive'))],
            });
            break;
          case 'SELL':
            await interaction.update({
              content: '**Step 2 of 3** — Which crypto do you want to **send**?',
              components: [row(cryptoSelect('panel:sell_crypto', 'Select crypto to send'))],
            });
            break;
          case 'SWAP':
            await interaction.update({
              content: '**Step 2 of 3** — Which crypto do you want to **send**?',
              components: [row(cryptoSelect('panel:swap_from', 'Select crypto to send'))],
            });
            break;
          case 'FIAT_TO_FIAT':
            await interaction.update({
              content: '**Step 2 of 3** — Which payment method are you **sending from**?',
              components: [row(fiatSelect('panel:f2f_from', 'Select sending method'))],
            });
            break;
        }
        break;
      }

      // ── BUY step 2: crypto chosen → pick fiat method ─────────────────────
      case 'buy_crypto': {
        const crypto = interaction.values[0]!;
        await interaction.update({
          content: `**Step 3 of 3** — How will you **pay** for ${crypto}?`,
          components: [row(fiatSelect(`panel:buy_method:${crypto}`, 'Select payment method'))],
        });
        break;
      }

      // ── BUY step 3: method chosen → open modal ───────────────────────────
      case 'buy_method': {
        const [crypto, ...methodParts] = ctx; // ctx = [crypto, ...method parts split by :]
        const method = methodParts.length ? [crypto, ...methodParts].slice(1).join(':') : interaction.values[0]!;
        // Actually ctx holds the crypto from the customId, values[0] is the method
        const cryptoAsset = ctx[0]!;
        const fiatMethod  = interaction.values[0]!;
        await showTradeModal(interaction, 'BUY', cryptoAsset, fiatMethod);
        break;
      }

      // ── SELL step 2: crypto chosen → pick fiat method ────────────────────
      case 'sell_crypto': {
        const crypto = interaction.values[0]!;
        await interaction.update({
          content: `**Step 3 of 3** — How do you want to **receive** payment for ${crypto}?`,
          components: [row(fiatSelect(`panel:sell_method:${crypto}`, 'Select receiving method'))],
        });
        break;
      }

      // ── SELL step 3: method chosen → open modal ──────────────────────────
      case 'sell_method': {
        const cryptoAsset = ctx[0]!;
        const fiatMethod  = interaction.values[0]!;
        await showTradeModal(interaction, 'SELL', cryptoAsset, fiatMethod);
        break;
      }

      // ── SWAP step 2: from crypto chosen → pick to crypto ─────────────────
      case 'swap_from': {
        const fromCrypto = interaction.values[0]!;
        await interaction.update({
          content: `**Step 3 of 3** — Which crypto do you want to **receive** in exchange for ${fromCrypto}?`,
          components: [row(cryptoSelect(`panel:swap_to:${fromCrypto}`, 'Select crypto to receive'))],
        });
        break;
      }

      // ── SWAP step 3: to crypto chosen → open modal ───────────────────────
      case 'swap_to': {
        const fromCrypto = ctx[0]!;
        const toCrypto   = interaction.values[0]!;
        if (fromCrypto === toCrypto) {
          await interaction.update({
            content: 'You cannot swap a coin for itself. Please go back and choose a different pair.',
            components: [row(cryptoSelect(`panel:swap_to:${fromCrypto}`, 'Select crypto to receive'))],
          });
          return;
        }
        await showTradeModal(interaction, 'SWAP', fromCrypto, toCrypto);
        break;
      }

      // ── F2F step 2: from method chosen → pick to method ──────────────────
      case 'f2f_from': {
        const fromMethod = interaction.values[0]!;
        await interaction.update({
          content: `**Step 3 of 3** — Which payment method do you want to **receive** into?`,
          components: [row(fiatSelect(`panel:f2f_to:${fromMethod}`, 'Select receiving method', fromMethod))],
        });
        break;
      }

      // ── F2F step 3: to method chosen → open modal ────────────────────────
      case 'f2f_to': {
        const fromMethod = ctx[0]!;
        const toMethod   = interaction.values[0]!;
        await showTradeModal(interaction, 'FIAT_TO_FIAT', fromMethod, toMethod);
        break;
      }

      default:
        logger.warn({ customId: interaction.customId }, 'Unknown panel step');
        await interaction.reply({ content: 'Unknown step.', ephemeral: true });
    }
  } catch (err) {
    logger.error({ err, customId: interaction.customId }, 'Select menu handler error');
    try {
      const msg = 'Something went wrong. Please try again.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    } catch { /* timed out */ }
  }
}

// ---------------------------------------------------------------------------
// Step 1 — direction dropdown
// ---------------------------------------------------------------------------

async function handleStartExchange(interaction: ButtonInteraction): Promise<void> {
  const directionMenu = new StringSelectMenuBuilder()
    .setCustomId('panel:direction')
    .setPlaceholder('What do you want to do?')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Buy')
        .setDescription('Purchase crypto with fiat')
        .setValue('BUY'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Sell')
        .setDescription('Sell crypto for fiat')
        .setValue('SELL'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Swap')
        .setDescription('Exchange one crypto for another')
        .setValue('SWAP'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Fiat to Fiat')
        .setDescription('Convert between payment methods')
        .setValue('FIAT_TO_FIAT'),
    );

  await interaction.reply({
    content: '**Step 1 of 3** — Choose your trade type.',
    components: [row(directionMenu)],
    ephemeral: true,
  });
}

// ---------------------------------------------------------------------------
// Open the advanced modal
//
// direction: BUY | SELL | SWAP | FIAT_TO_FIAT
// param1:    crypto (BUY/SELL/SWAP from) OR fiat method (F2F from)
// param2:    fiat method (BUY/SELL) OR crypto to (SWAP) OR fiat method to (F2F)
// ---------------------------------------------------------------------------

async function showTradeModal(
  interaction: StringSelectMenuInteraction,
  direction: string,
  param1: string,
  param2: string,
): Promise<void> {
  const isSwap = direction === 'SWAP';
  const isF2F  = direction === 'FIAT_TO_FIAT';

  const titleMap: Record<string, string> = {
    BUY:         'Buy Crypto — Trade Details',
    SELL:        'Sell Crypto — Trade Details',
    SWAP:        'Swap Crypto — Trade Details',
    FIAT_TO_FIAT:'Fiat to Fiat — Trade Details',
  };

  const modal = new ModalBuilder()
    .setCustomId(`trade_modal:${direction}:${param1}:${param2}`)
    .setTitle(titleMap[direction] ?? 'Trade Details');

  // Amount field — label adapts per direction
  const amountLabel = isSwap
    ? `Amount of ${param1} to send`
    : isF2F
      ? 'Amount to send'
      : direction === 'BUY'
        ? `Fiat amount to spend (${param1} value)`
        : `Fiat amount to receive (${param1} value)`;

  const amountInput = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel(amountLabel)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder(isF2F ? '500' : '100')
    .setMaxLength(20);

  // Currency (not needed for pure SWAP)
  const currencyInput = new TextInputBuilder()
    .setCustomId('fiat_currency')
    .setLabel('Currency (EUR, USD or GBP)')
    .setStyle(TextInputStyle.Short)
    .setRequired(!isSwap)
    .setPlaceholder('EUR')
    .setMaxLength(3);

  // Additional message
  const noteInput = new TextInputBuilder()
    .setCustomId('user_note')
    .setLabel('Additional message (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder('Any extra info for the exchanger...')
    .setMaxLength(500);

  const components: ActionRowBuilder<TextInputBuilder>[] = [
    new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput),
  ];

  if (!isSwap) {
    components.push(new ActionRowBuilder<TextInputBuilder>().addComponents(currencyInput));
  }

  // Discord modals support max 5 rows
  components.push(new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput));

  modal.addComponents(...components);

  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Release button → wallet address modal
// ---------------------------------------------------------------------------

async function handleReleaseButton(interaction: ButtonInteraction, tradeId: string): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`wallet_address:${tradeId}`)
    .setTitle('Enter Destination Wallet Address');

  const walletInput = new TextInputBuilder()
    .setCustomId('wallet_address')
    .setLabel('Destination wallet address')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('bc1q… / 0x… / ltc1q… / Sol…');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(walletInput),
  );

  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function row<T extends StringSelectMenuBuilder>(menu: T): ActionRowBuilder<T> {
  return new ActionRowBuilder<T>().addComponents(menu);
}
