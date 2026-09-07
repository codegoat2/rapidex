/**
 * Trade Flow Handler — implements every step of the trade lifecycle.
 *
 * Each function maps to one state transition:
 *
 *   handleClaim              OPEN         → CLAIMED        (exchanger)
 *   handleFiatSent           FIAT_PENDING → FIAT_SENT      (user)
 *   handleWalletAddressSubmit FIAT_SENT   → RELEASE_PENDING (exchanger, via modal)
 *   handleDispute            FIAT_SENT    → DISPUTED       (user or exchanger)
 *   handleForceReleaseConfirm/handleForceRelease   DISPUTED → COMPLETED (admin)
 *   handleForceCancelConfirm/handleForceCancel     DISPUTED → CANCELLED (admin)
 *
 * The TX send (RELEASE_PENDING → CRYPTO_SENT → COMPLETED) is triggered
 * from handleWalletAddressSubmit and delegated to the TX engine (Task 9).
 */

import {
  ButtonInteraction,
  ModalSubmitInteraction,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { requirePermission, requireActiveExchanger } from '../../security/rbac';
import {
  getTradeById,
  transitionTrade,
  InvalidTransitionError,
} from '../../engine/tradeService';
import {
  claimTradeWithEscrow,
  releaseEscrow,
  InsufficientBalanceError,
} from '../../ledger/ledgerService';
import {
  escrowLockKey,
  escrowReleaseKey,
} from '../../security/idempotency';
import { getExchangerByDiscordId } from '../../admin/exchangerService';
import { buildTradeEmbed, buildUserActionRow, buildExchangerActionRow } from '../embeds/tradeEmbed';
import { COLORS } from '../embeds/colors';
import { logger } from '../../utils/logger';
import { config } from '../../config/env';
import { getRoleAdmin } from '../../config/runtimeConfig';
import type { DbTrade } from '../../types';

// ---------------------------------------------------------------------------
// OPEN → CLAIMED
// ---------------------------------------------------------------------------

export async function handleClaim(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  await requirePermission(interaction, 'TRADE_CLAIM');
  await requireActiveExchanger(interaction, interaction.user.id);
  await interaction.deferReply({ ephemeral: true });

  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }
  if (trade.status !== 'OPEN') {
    await interaction.editReply(`❌ This trade is no longer open (status: ${trade.status}).`);
    return;
  }

  const exchanger = await getExchangerByDiscordId(interaction.user.id);
  if (!exchanger) { await interaction.editReply('❌ Exchanger record not found.'); return; }

  try {
    const fiatPendingTrade = await claimTradeWithEscrow({
      exchangerId:    exchanger.id,
      tradeId:        trade.id,
      asset:          trade.asset,
      amount:         trade.amount,
      idempotencyKey: escrowLockKey(trade.id, exchanger.id),
      actorDiscordId: interaction.user.id,
      note:           `Claimed by exchanger ${interaction.user.tag}`,
    });

    const channel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
    if (channel) {
      await channel.permissionOverwrites.create(interaction.user.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      });
      const tradeEmbed = buildTradeEmbed(fiatPendingTrade, interaction.user.tag);
      const userRow = buildUserActionRow(trade.id, 'FIAT_PENDING');
      const fiatEmbed = buildFiatInstructionsEmbed(fiatPendingTrade, interaction.user.tag);
      await channel.send({
        content: `<@${trade.user_discord_id}> Your trade has been claimed by **${interaction.user.tag}**! Please follow the payment instructions below.`,
        embeds: [tradeEmbed, fiatEmbed], components: [userRow],
      });
    }

    await interaction.editReply(`✅ You have claimed trade \`${trade.id}\`. Escrow locked: **${trade.amount} ${trade.asset}**`);
    void notifyAsync('notifyTradeClaimed', trade.id, interaction.user.id);
    logger.info({ tradeId: trade.id, exchangerId: exchanger.id }, 'Trade claimed');
    return;
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      await interaction.editReply(`❌ Insufficient balance to claim this trade.\nYou need **${trade.amount} ${trade.asset}** available.`);
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// FIAT_PENDING → FIAT_SENT
// ---------------------------------------------------------------------------

export async function handleFiatSent(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }

  // Only the trade's user can confirm fiat sent
  if (trade.user_discord_id !== interaction.user.id) {
    await interaction.editReply('❌ Only the trade creator can confirm payment.');
    return;
  }

  if (trade.status !== 'FIAT_PENDING') {
    await interaction.editReply(`❌ Trade is not awaiting payment (status: ${trade.status}).`);
    return;
  }

  const updated = await transitionTrade({
    tradeId:        trade.id,
    to:             'FIAT_SENT',
    actorDiscordId: interaction.user.id,
    note:           'User confirmed fiat payment sent',
  });

  const channel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.ESCROW)
      .setTitle('💳 Fiat Payment Confirmed')
      .setDescription(`<@${interaction.user.id}> has confirmed the payment has been sent.\n\n**Exchanger:** Please verify receipt and click **Release Crypto** to complete the trade.`)
      .setTimestamp();

    const exchangerRow = buildExchangerActionRow(trade.id, 'FIAT_SENT');
    await channel.send({ embeds: [embed], components: [exchangerRow] });
  }

  await interaction.editReply('✅ Payment confirmed. The exchanger will verify and release your crypto.');

  void notifyAsync('notifyFiatSent', trade.id, interaction.user.id);

  logger.info({ tradeId: trade.id }, 'Fiat marked as sent');
}

// ---------------------------------------------------------------------------
// FIAT_SENT → RELEASE_PENDING (wallet address collected via modal)
// ---------------------------------------------------------------------------

export async function handleWalletAddressSubmit(
  interaction: ModalSubmitInteraction,
  tradeId: string,
  walletAddress: string,
): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }

  // Only the exchanger on this trade can release
  const exchanger = await getExchangerByDiscordId(interaction.user.id);
  if (!exchanger || trade.exchanger_id !== exchanger.id) {
    await interaction.editReply('❌ You are not the exchanger on this trade.');
    return;
  }

  if (trade.status !== 'FIAT_SENT') {
    await interaction.editReply(`❌ Trade cannot be released in status: ${trade.status}.`);
    return;
  }

  const updated = await transitionTrade({
    tradeId:        trade.id,
    to:             'RELEASE_PENDING',
    actorDiscordId: interaction.user.id,
    note:           `Wallet address provided: ${walletAddress}`,
    updates:        { userWalletAddress: walletAddress },
  });

  await interaction.editReply('✅ Wallet address received. Sending crypto now...');

  // Trigger TX engine async
  void sendCryptoAsync(updated, exchanger.id);
}

// ---------------------------------------------------------------------------
// DISPUTED
// ---------------------------------------------------------------------------

export async function handleDispute(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }

  const allowedStates = ['FIAT_SENT', 'RELEASE_PENDING'];
  if (!allowedStates.includes(trade.status)) {
    await interaction.editReply(`❌ Disputes can only be raised after fiat is sent (current: ${trade.status}).`);
    return;
  }

  // Must be a participant
  const exchanger = await getExchangerByDiscordId(interaction.user.id);
  const isUser      = trade.user_discord_id === interaction.user.id;
  const isExchanger = exchanger && trade.exchanger_id === exchanger.id;

  if (!isUser && !isExchanger) {
    await interaction.editReply('❌ You are not a participant in this trade.');
    return;
  }

  await transitionTrade({
    tradeId:        trade.id,
    to:             'DISPUTED',
    actorDiscordId: interaction.user.id,
    note:           `Dispute raised by ${interaction.user.tag}`,
  });

  const channel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
  if (channel) {
    const roleId = await getRoleAdmin();
    const embed = new EmbedBuilder()
      .setColor(COLORS.DISPUTED)
      .setTitle('⚠️ Trade Disputed')
      .setDescription(
        `A dispute has been raised by <@${interaction.user.id}>.\n\n${roleId ? `<@&${roleId}>` : '@here'} please review this trade and use \`/force-release\` or \`/force-cancel\` to resolve it.`,
      )
      .addFields({ name: 'Trade ID', value: `\`${trade.id}\`` })
      .setTimestamp();

    const adminRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`admin_force_release:${trade.id}`)
        .setLabel('Force Release')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`admin_force_cancel:${trade.id}`)
        .setLabel('Force Cancel')
        .setStyle(ButtonStyle.Danger),
    );

    await channel.send({
      content:    roleId ? `<@&${roleId}>` : '@here',
      embeds:     [embed],
      components: [adminRow],
    });
  }

  await interaction.editReply('⚠️ Dispute raised. An admin has been notified.');

  void notifyAsync('notifyDisputeRaised', trade.id, interaction.user.id);

  logger.warn({ tradeId: trade.id, actor: interaction.user.id }, 'Trade disputed');
}

// ---------------------------------------------------------------------------
// Admin: force-release confirmation + execution
// ---------------------------------------------------------------------------

export async function handleForceReleaseConfirm(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  await requirePermission(interaction, 'ADMIN_FORCE_ACTION');
  await interaction.deferReply({ ephemeral: true });

  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('⚠️ Confirm Force Release')
    .setDescription(`This will send **${trade.amount} ${trade.asset}** to the user's wallet.\nAre you sure?`);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_force_release:${tradeId}`)
      .setLabel('Yes, Force Release')
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

export async function handleForceRelease(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  await requirePermission(interaction, 'ADMIN_FORCE_ACTION');
  await interaction.deferReply({ ephemeral: true });

  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }
  if (trade.status !== 'DISPUTED') {
    await interaction.editReply(`❌ Trade must be DISPUTED to force-release (current: ${trade.status}).`);
    return;
  }
  if (!trade.user_wallet_address) {
    await interaction.editReply('❌ No wallet address on record. Cannot release without a destination.');
    return;
  }

  // Trigger TX engine
  const exchanger = trade.exchanger_id
    ? (await (await import('../../admin/exchangerService')).getExchangerById(trade.exchanger_id))
    : null;

  if (!exchanger) { await interaction.editReply('❌ Exchanger record missing.'); return; }

  const pendingTrade = await transitionTrade({
    tradeId: trade.id,
    to: 'RELEASE_PENDING',
    actorDiscordId: interaction.user.id,
    note: `Force-release approved by admin ${interaction.user.tag}`,
  });

  await interaction.editReply('⏳ Sending crypto...');
  void sendCryptoAsync(pendingTrade, exchanger.id, interaction.user.id);

  await db_auditLog(interaction.user.id, trade.user_discord_id, 'FORCE_RELEASE', 'trade', trade.id);
}

export async function handleForceCancelConfirm(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  await requirePermission(interaction, 'ADMIN_FORCE_ACTION');
  await interaction.deferReply({ ephemeral: true });

  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('⚠️ Confirm Force Cancel')
    .setDescription(`This will return **${trade.amount} ${trade.asset}** to the exchanger's available balance.\nAre you sure?`);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_force_cancel:${tradeId}`)
      .setLabel('Yes, Force Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

export async function handleForceCancel(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  await requirePermission(interaction, 'ADMIN_FORCE_ACTION');
  await interaction.deferReply({ ephemeral: true });

  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }
  if (trade.status !== 'DISPUTED') {
    await interaction.editReply(`❌ Trade must be DISPUTED to force-cancel (current: ${trade.status}).`);
    return;
  }

  // Release escrow back to exchanger
  if (trade.exchanger_id) {
    await releaseEscrow({
      exchangerId:    trade.exchanger_id,
      tradeId:        trade.id,
      asset:          trade.asset,
      amount:         trade.amount,
      idempotencyKey: escrowReleaseKey(trade.id, 'CANCEL'),
    });
  }

  await transitionTrade({
    tradeId:        trade.id,
    to:             'CANCELLED',
    actorDiscordId: interaction.user.id,
    note:           `Force-cancelled by admin ${interaction.user.tag}`,
  });

  const channel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
  if (channel) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.ERROR)
          .setTitle('❌ Trade Force-Cancelled')
          .setDescription(`Admin <@${interaction.user.id}> has cancelled this trade. Funds returned to exchanger.`)
          .setTimestamp(),
      ],
    });
  }

  await interaction.editReply('✅ Trade force-cancelled. Escrow returned to exchanger.');
  await db_auditLog(interaction.user.id, trade.user_discord_id, 'FORCE_CANCEL', 'trade', trade.id);
}

// ---------------------------------------------------------------------------
// Async TX trigger (delegates to txEngine — Task 9)
// ---------------------------------------------------------------------------

async function sendCryptoAsync(
  trade: DbTrade,
  exchangerId: string,
  adminDiscordId?: string,
): Promise<void> {
  try {
    const { sendTradePayment } = await import('../../engine/txEngine');
    await sendTradePayment(trade, exchangerId, adminDiscordId);
  } catch (err) {
    logger.error({ err, tradeId: trade.id }, 'Failed to send crypto');

    // Alert admin channel
    try {
      const { sendAdminAlert } = await import('../../notifications/notificationService');
      await sendAdminAlert(
        `⚠️ TX FAILED for trade \`${trade.id}\`\nAsset: ${trade.asset} | Amount: ${trade.amount}\nError: ${String(err)}`,
      );
    } catch { /* non-fatal */ }
  }
}

async function notifyAsync(
  fnName: string,
  tradeId: string,
  actorDiscordId: string,
): Promise<void> {
  try {
    const ns = await import('../../notifications/notificationService');
    const fn = ns[fnName as keyof typeof ns] as ((t: string, a: string) => Promise<void>) | undefined;
    if (fn) await fn(tradeId, actorDiscordId);
  } catch (err) {
    logger.warn({ err, fnName }, 'Notification failed — non-fatal');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFiatInstructionsEmbed(trade: DbTrade, exchangerUsername: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('💳 Fiat Payment Instructions')
    .setDescription(
      [
        `Please send your payment via **${trade.fiat_method.replace(/_/g, ' ')}** to the exchanger.`,
        '',
        `The exchanger will provide their payment details in this channel.`,
        '',
        `Once you have sent the payment, click **"I've Sent Payment"** below.`,
        '',
        `⚠️ Do not click the button until you have actually sent the payment.`,
      ].join('\n'),
    )
    .addFields(
      { name: 'Exchanger', value: `@${exchangerUsername}`,           inline: true },
      { name: 'Asset',     value: trade.asset,                        inline: true },
      { name: 'Amount',    value: `${parseFloat(trade.amount).toFixed(8)}`, inline: true },
    )
    .setTimestamp();
}

async function db_auditLog(
  actorDiscordId: string,
  targetDiscordId: string,
  action: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  try {
    const { db } = await import('../../db/client');
    await db`
      INSERT INTO audit_logs (actor_discord_id, target_discord_id, action, entity_type, entity_id)
      VALUES (${actorDiscordId}, ${targetDiscordId}, ${action}, ${entityType}, ${entityId})
    `;
  } catch (err) {
    logger.warn({ err }, 'Failed to write audit log — non-fatal');
  }
}
