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
import {
  getExchangerByDiscordId,
  hasUserAcceptedTerms,
  recordTermsAcceptance,
  getExchangerTerms,
} from '../../admin/exchangerService';
import {
  buildTradeEmbed,
  buildUserActionRow,
  buildExchangerActionRow,
  buildFiatInstructionsEmbed,
  buildReleaseMethodRow,
  buildTermsEmbed,
  buildExternalPaymentCheckEmbed,
} from '../embeds/tradeEmbed';
import { COLORS } from '../embeds/colors';
import { logger } from '../../utils/logger';
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

  // ── T&C gate ─────────────────────────────────────────────────────────────
  const accepted = await hasUserAcceptedTerms({
    userDiscordId: trade.user_discord_id,
    exchangerId:   exchanger.id,
  });

  if (!accepted) {
    const terms = await getExchangerTerms(exchanger.id);
    if (terms) {
      // Post T&C to the ticket channel so the BUYER can see and accept/decline.
      // The exchanger gets an ephemeral reply confirming the T&C was sent.
      const ticketChannel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
      if (ticketChannel) {
        const { embed, row } = buildTermsEmbed({
          terms,
          exchangerUsername: interaction.user.username,
          tradeId,
          exchangerId: exchanger.id,
        });
        await ticketChannel.send({
          content: `<@${trade.user_discord_id}> — **@${interaction.user.username}** wants to claim your trade but has Terms & Conditions you must review first.`,
          embeds:     [embed],
          components: [row],
        });
      }
      await interaction.editReply(
        '📜 Your Terms & Conditions have been posted in the ticket channel. The trade will be claimed once the buyer accepts.',
      );
      return;
    }
  }

  await claimTrade(interaction, trade, exchanger);
}

/** Inner claim — called after T&C accepted (or no T&C set). */
export async function claimTrade(
  interaction: ButtonInteraction,
  trade: import('../../types').DbTrade,
  exchanger: import('../../types').DbExchanger,
): Promise<void> {
  try {
    const fiatPendingTrade = await claimTradeWithEscrow({
      exchangerId:    exchanger.id,
      tradeId:        trade.id,
      asset:          trade.asset,
      amount:         trade.amount,
      idempotencyKey: escrowLockKey(trade.id, exchanger.id),
      actorDiscordId: interaction.user.id,
      note:           `Claimed by exchanger ${interaction.user.username}`,
    });

    const channel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
    if (channel) {
      await channel.permissionOverwrites.create(interaction.user.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      });
      // Single embed that combines trade summary + payment instructions
      const fiatEmbed = buildFiatInstructionsEmbed(fiatPendingTrade, interaction.user.username);
      const userRow   = buildUserActionRow(trade.id, 'FIAT_PENDING');
      await channel.send({
        content:    `<@${trade.user_discord_id}> Your trade has been claimed by **${interaction.user.username}**.`,
        embeds:     [fiatEmbed],
        components: [userRow],
      });
    }

    await interaction.editReply(`✅ You've claimed trade \`${trade.id}\`. Escrow locked: **${trade.amount} ${trade.asset}**`);
    void notifyAsync('notifyTradeClaimed', trade.id, interaction.user.id);
    void (await import('../services/forumService')).closeForumThread(trade.id, 'CLAIMED');
    logger.info({ tradeId: trade.id, exchangerId: exchanger.id }, 'Trade claimed');
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
      .setTitle('<:DebtCard:1547332209684381756> Payment Sent — Awaiting Release')
      .setDescription(
        `<@${interaction.user.id}> has confirmed payment was sent.\n\n` +
        `**Exchanger** — verify receipt then choose how to release below.\n\n` +
        `> <:lock:1547331951877165128> **Internal Wallet** — release directly from the bot's hot wallet\n` +
        `> <:Arrow:1547330759571017768> **External / Manual** — you'll send manually; bot will confirm with the buyer\n` +
        `> <:emojigg_no:1547332976201830441> **Dispute** — open a dispute for admin review`,
      )
      .addFields({ name: 'Trade ID', value: `\`${trade.id}\``, inline: true })
      .setTimestamp();

    const releaseRow = buildReleaseMethodRow(trade.id);
    await channel.send({ embeds: [embed], components: [releaseRow] });
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

  // Only the BUYER submits their own wallet address
  if (trade.user_discord_id !== interaction.user.id) {
    await interaction.editReply('❌ Only the trade buyer can submit a wallet address.');
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
    note:           `Buyer provided wallet address: ${walletAddress}`,
    updates:        { userWalletAddress: walletAddress },
  });

  // Confirm to the buyer in the ticket channel
  const channel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle('📬 Wallet Address Received — Sending Crypto')
      .setDescription(
        `Your wallet address has been recorded. The bot is now sending your **${trade.asset}**.\n\n` +
        `You will receive a notification once the transaction is broadcast.`,
      )
      .addFields(
        { name: '📬 Your Address', value: `\`${walletAddress}\``,                                       inline: false },
        { name: '💎 Asset',        value: trade.asset,                                                   inline: true  },
        { name: '🔢 Amount',       value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true  },
      )
      .setFooter({ text: 'RapidEx · Do not close this channel until confirmed' })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }

  await interaction.editReply('✅ Address received. Your crypto is being sent now.');

  // Trigger TX engine — use exchanger id from the trade record
  if (trade.exchanger_id) {
    void sendCryptoAsync(updated, trade.exchanger_id);
  }
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
    note:           `Dispute raised by ${interaction.user.username}`,
  });

  const channel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
  if (channel) {
    const roleId = await getRoleAdmin();
    const embed = new EmbedBuilder()
      .setColor(COLORS.DISPUTED)
      .setTitle('Trade Disputed')
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

  await interaction.editReply('<:emojigg_no:1547332976201830441> Dispute raised. An admin has been notified.');

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
    .setTitle('Confirm Force Release')
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
    .setTitle('Confirm Force Cancel')
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
          .setTitle('Trade Force-Cancelled')
          .setDescription(`Admin <@${interaction.user.id}> has cancelled this trade. Funds returned to exchanger.`)
          .setTimestamp(),
      ],
    });
  }

  await interaction.editReply('<:GreenCheckmark:1547332810048667659> Trade force-cancelled. Escrow returned to exchanger.');
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
        `<:emojigg_no:1547332976201830441> TX FAILED for trade \`${trade.id}\`\nAsset: ${trade.asset} | Amount: ${trade.amount}\nError: ${String(err)}`,
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

// buildFiatInstructionsEmbed is imported from ../embeds/tradeEmbed

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

// ---------------------------------------------------------------------------
// T&C — Accept (buyer clicks Accept on exchanger's terms)
// ---------------------------------------------------------------------------

export async function handleTermsAccept(
  interaction: ButtonInteraction,
  payload: string, // "tradeId:exchangerId"
): Promise<void> {
  await interaction.deferUpdate();

  const [tradeId, exchangerId] = payload.split(':');
  if (!tradeId || !exchangerId) {
    await interaction.followUp({ content: '❌ Invalid terms payload.', ephemeral: true });
    return;
  }

  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.followUp({ content: '❌ Trade not found.', ephemeral: true }); return; }

  // Only the buyer on this trade can accept
  if (trade.user_discord_id !== interaction.user.id) {
    await interaction.followUp({ content: '❌ Only the trade creator can accept these terms.', ephemeral: true });
    return;
  }

  if (trade.status !== 'OPEN') {
    await interaction.followUp({ content: `❌ Trade is no longer open (status: ${trade.status}).`, ephemeral: true });
    return;
  }

  // Record acceptance
  await recordTermsAcceptance({ userDiscordId: interaction.user.id, exchangerId, tradeId });

  // Now proceed to claim — find the exchanger who posted the terms
  const { getExchangerById } = await import('../../admin/exchangerService');
  const exchanger = await getExchangerById(exchangerId);
  if (!exchanger) {
    await interaction.followUp({ content: '❌ Exchanger not found.', ephemeral: true });
    return;
  }

  // Disable the T&C buttons so they can't be clicked again
  await interaction.editReply({ components: [] }).catch(() => undefined);

  // Re-use claimTrade (skips T&C check since acceptance is already recorded)
  await claimTrade(interaction, trade, exchanger);
}

export async function handleTermsDecline(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  await interaction.deferUpdate();
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle('<:emojigg_no:1547332976201830441> Terms Declined')
        .setDescription('You declined the exchanger\'s Terms & Conditions. This exchanger cannot claim your trade.\n\nAnother exchanger will be able to pick it up, or you may open a new trade.')
        .setTimestamp(),
    ],
    components: [],
  });
  logger.info({ tradeId, userId: interaction.user.id }, 'User declined exchanger T&C');
}

// ---------------------------------------------------------------------------
// Release method selection (FIAT_SENT → exchanger picks internal / external)
// ---------------------------------------------------------------------------

/**
 * Internal wallet release — exchanger clicks "Internal Wallet".
 * Bot posts a message in the ticket channel prompting the BUYER to submit
 * their destination wallet address via a button → modal flow.
 */
export async function handleReleaseInternal(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }

  const exchanger = await getExchangerByDiscordId(interaction.user.id);
  if (!exchanger || trade.exchanger_id !== exchanger.id) {
    await interaction.editReply('❌ You are not the exchanger on this trade.');
    return;
  }
  if (trade.status !== 'FIAT_SENT') {
    await interaction.editReply(`❌ Trade is not in FIAT_SENT state (current: ${trade.status}).`);
    return;
  }

  // Ask the buyer in the ticket channel to provide their wallet address
  const channel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
  if (channel) {
    const { ActionRowBuilder: AR, ButtonBuilder: BB, ButtonStyle: BS, EmbedBuilder: EB } = await import('discord.js');
    const embed = new EB()
      .setColor(COLORS.PRIMARY)
      .setTitle('📬 Enter Your Wallet Address')
      .setDescription(
        `<@${trade.user_discord_id}> — the exchanger is ready to release your **${trade.asset}**.\n\n` +
        `Please click **Submit Wallet Address** below and enter the address where you want to receive your funds.\n\n` +
        `⚠️ **Double-check your address before submitting. Transactions cannot be reversed.**`,
      )
      .addFields(
        { name: '💎 Asset',  value: trade.asset,                                      inline: true },
        { name: '🔢 Amount', value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
      )
      .setFooter({ text: 'RapidEx · Only submit your own wallet address' })
      .setTimestamp();

    const row = new AR<import('discord.js').ButtonBuilder>().addComponents(
      new BB()
        .setCustomId(`submit_wallet:${tradeId}`)
        .setLabel('📬 Submit Wallet Address')
        .setStyle(BS.Primary),
    );

    await channel.send({
      content: `<@${trade.user_discord_id}>`,
      embeds: [embed],
      components: [row],
    });
  }

  await interaction.editReply('✅ The buyer has been prompted to submit their wallet address.');
  logger.info({ tradeId: trade.id, exchangerId: exchanger.id }, 'Internal release: buyer wallet address requested');
}

/**
 * Buyer clicks "Submit Wallet Address" → show them the address modal.
 * Only the buyer on this trade can click it.
 */
export async function handleSubmitWallet(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.reply({ content: '❌ Trade not found.', ephemeral: true }); return; }

  if (trade.user_discord_id !== interaction.user.id) {
    await interaction.reply({ content: '❌ Only the buyer can submit their wallet address.', ephemeral: true });
    return;
  }
  if (trade.status !== 'FIAT_SENT') {
    await interaction.reply({ content: `❌ Trade is not in the right state for this action (${trade.status}).`, ephemeral: true });
    return;
  }

  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
  const modal = new ModalBuilder()
    .setCustomId(`wallet_address:${tradeId}`)
    .setTitle(`Enter Your ${trade.asset} Wallet Address`);

  const addressInput = new TextInputBuilder()
    .setCustomId('wallet_address')
    .setLabel(`Your ${trade.asset} destination address`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(200)
    .setPlaceholder(
      trade.asset === 'BTC' ? 'bc1q... or 1... or 3...' :
      trade.asset === 'LTC' ? 'ltc1q... or L...' :
      trade.asset === 'ETH' ? '0x...' :
      trade.asset === 'SOL' ? '4... (Base58)' :
      trade.asset === 'BNB' || trade.asset === 'USDT_BEP20' ? '0x... (BSC)' :
      'Your wallet address',
    );

  modal.addComponents(new ActionRowBuilder<import('discord.js').TextInputBuilder>().addComponents(addressInput));
  await interaction.showModal(modal);
}

/**
 * External / manual release — bot DMs buyer asking if they received payment.
 * Exchanger has already sent funds manually outside the bot.
 */
export async function handleReleaseExternal(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }

  const exchanger = await getExchangerByDiscordId(interaction.user.id);
  if (!exchanger || trade.exchanger_id !== exchanger.id) {
    await interaction.editReply('❌ You are not the exchanger on this trade.');
    return;
  }
  if (trade.status !== 'FIAT_SENT') {
    await interaction.editReply(`❌ Trade is not in FIAT_SENT state (current: ${trade.status}).`);
    return;
  }

  // Move to RELEASE_PENDING to lock the state
  await transitionTrade({
    tradeId:        trade.id,
    to:             'RELEASE_PENDING',
    actorDiscordId: interaction.user.id,
    note:           'External/manual release selected — awaiting buyer confirmation',
  });

  // Post confirmation request to the ticket channel
  const channel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
  if (channel) {
    const { embed, row } = buildExternalPaymentCheckEmbed(trade, interaction.user.tag);
    await channel.send({
      content: `<@${trade.user_discord_id}> — the exchanger has marked the payment as sent.`,
      embeds:     [embed],
      components: [row],
    });
  }

  await interaction.editReply('✅ Confirmation request sent to the buyer. Waiting for their response.');
  logger.info({ tradeId: trade.id, exchangerId: exchanger.id }, 'External release initiated');
}

/**
 * Buyer confirms they received the external payment → complete trade.
 */
export async function handleExternalPaymentReceived(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }

  if (trade.user_discord_id !== interaction.user.id) {
    await interaction.editReply('❌ Only the trade creator can confirm receipt.');
    return;
  }
  if (trade.status !== 'RELEASE_PENDING') {
    await interaction.editReply(`❌ Trade is not awaiting confirmation (status: ${trade.status}).`);
    return;
  }

  // Release escrow back to exchanger (external — no on-chain TX from bot)
  if (trade.exchanger_id) {
    await releaseEscrow({
      exchangerId:    trade.exchanger_id,
      tradeId:        trade.id,
      asset:          trade.asset,
      amount:         trade.amount,
      idempotencyKey: escrowReleaseKey(trade.id, 'COMPLETE'),
    });
  }

  await transitionTrade({
    tradeId:        trade.id,
    to:             'COMPLETED',
    actorDiscordId: interaction.user.id,
    note:           'Buyer confirmed receipt of external payment',
    updates:        { completedAt: new Date() },
  });

  const channel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.COMPLETED)
      .setTitle('<:GreenCheckmark:1547332810048667659> Trade Completed')
      .setDescription(
        `<@${interaction.user.id}> confirmed they received the payment.\n\n` +
        `This trade is now complete. Thank you for using RapidEx!`,
      )
      .addFields(
        { name: 'Trade ID', value: `\`${trade.id}\``, inline: true },
        { name: 'Asset',    value: trade.asset,        inline: true },
        { name: 'Amount',   value: `${parseFloat(trade.amount).toFixed(8)}`, inline: true },
      )
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }

  await interaction.editReply('<:GreenCheckmark:1547332810048667659> Trade marked complete. Thank you!');
  void notifyAsync('notifyTradeCompleted', trade.id, interaction.user.id);
  logger.info({ tradeId: trade.id }, 'External trade completed by buyer confirmation');
}

/**
 * Buyer says they did NOT receive the external payment → raise dispute.
 */
export async function handleExternalPaymentNotReceived(
  interaction: ButtonInteraction,
  tradeId: string,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const trade = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }

  if (trade.user_discord_id !== interaction.user.id) {
    await interaction.editReply('❌ Only the trade creator can respond here.');
    return;
  }
  if (trade.status !== 'RELEASE_PENDING') {
    await interaction.editReply(`❌ Trade is not awaiting confirmation (status: ${trade.status}).`);
    return;
  }

  await transitionTrade({
    tradeId:        trade.id,
    to:             'DISPUTED',
    actorDiscordId: interaction.user.id,
    note:           'Buyer did not receive external payment — auto-disputed',
  });

  const channel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
  if (channel) {
    const roleId = await getRoleAdmin();
    const embed  = new EmbedBuilder()
      .setColor(COLORS.DISPUTED)
      .setTitle('<:emojigg_no:1547332976201830441> Dispute — Payment Not Received')
      .setDescription(
        `<@${interaction.user.id}> has reported they **did not receive** the payment.\n\n` +
        `${roleId ? `<@&${roleId}>` : '@here'} please review this trade.`,
      )
      .addFields({ name: 'Trade ID', value: `\`${trade.id}\``, inline: true })
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

  await interaction.editReply('<:emojigg_no:1547332976201830441> Dispute raised. An admin has been notified.');
  void notifyAsync('notifyDisputeRaised', trade.id, interaction.user.id);
  logger.warn({ tradeId: trade.id }, 'External trade disputed — buyer did not receive');
}
