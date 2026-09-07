/**
 * Button Interaction Handler — routes all button clicks.
 *
 * customId conventions:
 *   panel:start_exchange          — open trade creation modal
 *   claim:<tradeId>               — exchanger claims open trade
 *   fiat_sent:<tradeId>           — user confirms fiat sent
 *   release:<tradeId>             — exchanger releases crypto (opens wallet modal)
 *   dispute:<tradeId>             — raise dispute
 *   admin_force_release:<tradeId> — admin force release
 *   admin_force_cancel:<tradeId>  — admin force cancel
 *   confirm_force_release:<tradeId>
 *   confirm_force_cancel:<tradeId>
 */

import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { logger } from '../../utils/logger';

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [action, ...rest] = interaction.customId.split(':');
  const id = rest.join(':'); // tradeId may contain colons

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
      default:
        logger.warn({ customId: interaction.customId }, 'Unknown button action');
        await interaction.reply({ content: '❌ Unknown action.', ephemeral: true });
    }
  } catch (err) {
    logger.error({ err, customId: interaction.customId }, 'Button handler error');
    const msg = '❌ Something went wrong. Please try again.';
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    } catch { /* interaction timed out */ }
  }
}

// ---------------------------------------------------------------------------
// Panel — open trade creation modal
// ---------------------------------------------------------------------------

async function handleStartExchange(interaction: ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId('trade_create')
    .setTitle('Start a RapidEx Trade');

  const assetInput = new TextInputBuilder()
    .setCustomId('asset')
    .setLabel('Asset (BTC / LTC / ETH / USDT_ERC20 / USDC_ERC20 / USDC_SPL)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('BTC');

  const directionInput = new TextInputBuilder()
    .setCustomId('direction')
    .setLabel('Direction (BUY or SELL)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('BUY');

  const amountInput = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel('Amount (crypto)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('0.05');

  const fiatCurrencyInput = new TextInputBuilder()
    .setCustomId('fiat_currency')
    .setLabel('Fiat Currency (EUR / USD / GBP)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('EUR');

  const fiatMethodInput = new TextInputBuilder()
    .setCustomId('fiat_method')
    .setLabel('Payment Method (BANK_TRANSFER / REVOLUT / WISE / PAYPAL / CASH_IN_PERSON / OTHER)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('REVOLUT');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(assetInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(directionInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(fiatCurrencyInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(fiatMethodInput),
  );

  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Release — show wallet address modal
// ---------------------------------------------------------------------------

async function handleReleaseButton(interaction: ButtonInteraction, tradeId: string): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`wallet_address:${tradeId}`)
    .setTitle('Enter User Wallet Address');

  const walletInput = new TextInputBuilder()
    .setCustomId('wallet_address')
    .setLabel('Destination wallet address')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('bc1q... / 0x... / ltc1q... / Sol...');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(walletInput),
  );

  await interaction.showModal(modal);
}
