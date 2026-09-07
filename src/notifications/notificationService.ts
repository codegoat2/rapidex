/**
 * Notification Service — Discord messages at every trade state transition.
 *
 * All functions are fire-and-forget safe (callers void them).
 * DM failures (user has DMs closed) are caught and logged — never throw.
 */

import { EmbedBuilder, TextChannel } from 'discord.js';
import { getDiscordClient } from '../bot/client';
import { getTradeById } from '../engine/tradeService';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { COLORS } from '../bot/embeds/colors';
import { assetLabel, fiatMethodLabel } from '../bot/embeds/tradeEmbed';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

async function postToChannel(channelId: string, embed: EmbedBuilder, content?: string): Promise<void> {
  try {
    const client  = getDiscordClient();
    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel) return;
    await channel.send({ content, embeds: [embed] });
  } catch (err) {
    logger.warn({ err, channelId }, 'Failed to post to channel');
  }
}

async function dmUser(discordId: string, embed: EmbedBuilder): Promise<void> {
  try {
    const client = getDiscordClient();
    const user   = await client.users.fetch(discordId).catch(() => null);
    if (!user) return;
    await user.send({ embeds: [embed] }).catch(() => {
      // User has DMs disabled — silently ignore
    });
  } catch (err) {
    logger.warn({ err, discordId }, 'Failed to DM user — non-fatal');
  }
}

// ---------------------------------------------------------------------------
// Trade notifications
// ---------------------------------------------------------------------------

export async function notifyTradeClaimed(tradeId: string, exchangerDiscordId: string): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('🤝 Trade Claimed')
    .setDescription(
      `Your trade has been claimed by a verified exchanger.\n` +
      `Check your private ticket channel for payment instructions.`,
    )
    .addFields(
      { name: '💎 Asset',      value: assetLabel(trade.asset),                                     inline: true },
      { name: '🔢 Amount',     value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
      { name: '🆔 Trade ID',   value: `\`${trade.id}\``,                                          inline: false },
    )
    .setFooter({ text: 'RapidEx · Verified Exchanger Claimed Your Trade' })
    .setTimestamp();

  await postToChannel(trade.ticket_channel_id, embed);
  await dmUser(trade.user_discord_id, embed);
}

export async function notifyFiatSent(tradeId: string, _actorDiscordId: string): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade || !trade.exchanger_id) return;

  const rows = await (await import('../db/client')).db<{ discord_id: string }[]>`
    SELECT discord_id FROM exchangers WHERE id = ${trade.exchanger_id}
  `;
  const exchangerDiscordId = rows[0]?.discord_id;
  if (!exchangerDiscordId) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('💳 Payment Marked as Sent')
    .setDescription(
      `The buyer has confirmed their payment has been sent.\n\n` +
      `**Verify receipt** then choose how to release in the ticket channel.`,
    )
    .addFields(
      { name: '🆔 Trade ID',   value: `\`${trade.id}\``,          inline: true  },
      { name: '💎 Asset',      value: assetLabel(trade.asset),     inline: true  },
      { name: '🔢 Amount',     value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
    )
    .setFooter({ text: 'RapidEx · Action Required — Verify and Release' })
    .setTimestamp();

  await postToChannel(trade.ticket_channel_id, embed);
  await dmUser(exchangerDiscordId, embed);
}

export async function notifyCryptoSent(tradeId: string, txId: string, explorerUrl: string): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('🚀 Crypto Sent — Awaiting Confirmation')
    .setDescription(
      `**\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\`** has been broadcast to the blockchain.\n\n` +
      `Your transaction is awaiting network confirmations.`,
    )
    .addFields(
      { name: '🔗 Transaction',  value: `[\`${txId.slice(0, 20)}...\`](${explorerUrl})`, inline: false },
      { name: '📬 Destination',  value: `\`${trade.user_wallet_address ?? 'N/A'}\``,     inline: false },
      { name: '🆔 Trade ID',     value: `\`${trade.id}\``,                               inline: true  },
    )
    .setFooter({ text: 'RapidEx · Transaction Broadcast · Waiting for Confirmations' })
    .setTimestamp();

  await postToChannel(trade.ticket_channel_id, embed);
  await dmUser(trade.user_discord_id, embed);
}

export async function notifyTradeCompleted(tradeId: string): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.COMPLETED)
    .setTitle('✅ Trade Completed!')
    .setDescription(
      `Your trade has been completed successfully.\n\n` +
      `Thank you for using RapidEx!`,
    )
    .addFields(
      { name: '💎 Asset',    value: assetLabel(trade.asset),                                     inline: true  },
      { name: '🔢 Amount',   value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true  },
      { name: '🆔 Trade ID', value: `\`${trade.id}\``,                                          inline: false },
    )
    .setFooter({ text: 'RapidEx · Trade Complete · Come back anytime' })
    .setTimestamp();

  await postToChannel(trade.ticket_channel_id, embed);
  await dmUser(trade.user_discord_id, embed);
}

export async function notifyTradeExpired(tradeId: string): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle('⏰ Trade Expired — No Exchanger Available')
    .setDescription(
      `Your trade was not claimed by an exchanger within **${config.TIMEOUT_OPEN_MINUTES} minutes** and has expired.\n\n` +
      `You can open a new trade at any time from the exchange panel.`,
    )
    .addFields(
      { name: '💎 Asset',    value: assetLabel(trade.asset),     inline: true },
      { name: '🆔 Trade ID', value: `\`${trade.id}\``,          inline: true },
    )
    .setFooter({ text: 'RapidEx · Trade Expired · No action needed' })
    .setTimestamp();

  await postToChannel(trade.ticket_channel_id, embed);
  await dmUser(trade.user_discord_id, embed);
}

export async function notifyTradeCancelled(tradeId: string): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle('❌ Trade Cancelled')
    .setDescription(
      `This trade has been cancelled. The exchanger's escrow has been released.\n\n` +
      `If you believe this was an error, please contact an admin.`,
    )
    .addFields(
      { name: '🆔 Trade ID', value: `\`${trade.id}\``, inline: true },
    )
    .setFooter({ text: 'RapidEx · Trade Cancelled' })
    .setTimestamp();

  await postToChannel(trade.ticket_channel_id, embed);
  await dmUser(trade.user_discord_id, embed);
}

export async function notifyDisputeRaised(tradeId: string, actorDiscordId: string): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.DISPUTED)
    .setTitle('⚠️ Dispute Raised — Admin Review Required')
    .setDescription(
      `A dispute has been raised on this trade.\n\n` +
      `An admin will review the situation and resolve it shortly.\n` +
      `**Please do not take any further action** until the admin has resolved the dispute.`,
    )
    .addFields(
      { name: '👤 Raised By', value: `<@${actorDiscordId}>`, inline: true  },
      { name: '💎 Asset',     value: assetLabel(trade.asset), inline: true  },
      { name: '🔢 Amount',    value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
      { name: '🆔 Trade ID',  value: `\`${trade.id}\``,      inline: false },
    )
    .setFooter({ text: 'RapidEx · Dispute Under Review' })
    .setTimestamp();

  await postToChannel(trade.ticket_channel_id, embed);
}

export async function notifyDepositCredited(
  exchangerId: string,
  asset: string,
  amount: string,
  txId: string,
): Promise<void> {
  try {
    const { db } = await import('../db/client');
    const rows = await db<{ discord_id: string }[]>`
      SELECT discord_id FROM exchangers WHERE id = ${exchangerId}
    `;
    const discordId = rows[0]?.discord_id;
    if (!discordId) return;

    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle('💰 Deposit Credited to Your Balance')
      .setDescription(
        `**\`${parseFloat(amount).toFixed(8)} ${asset}\`** has been credited to your RapidEx exchanger balance.\n\n` +
        `Your available balance has been updated and you can now claim trades.`,
      )
      .addFields(
        { name: '💎 Asset',       value: assetLabel(asset), inline: true  },
        { name: '🔢 Amount',      value: `\`${parseFloat(amount).toFixed(8)} ${asset}\``, inline: true },
        { name: '🔗 Transaction', value: `\`${txId.slice(0, 40)}\``, inline: false },
      )
      .setFooter({ text: 'RapidEx · Deposit Confirmed' })
      .setTimestamp();

    await dmUser(discordId, embed);
  } catch (err) {
    logger.warn({ err }, 'notifyDepositCredited failed');
  }
}

// ---------------------------------------------------------------------------
// Admin alert (posts to admin alerts channel)
// ---------------------------------------------------------------------------

export async function sendAdminAlert(message: string): Promise<void> {
  try {
    const { getChannelAdminAlerts } = await import('../config/runtimeConfig');
    const channelId = await getChannelAdminAlerts();
    if (!channelId) {
      logger.warn({}, 'CHANNEL_ADMIN_ALERTS not configured — set it in dashboard Settings');
      return;
    }
    const client  = getDiscordClient();
    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel) return;
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.ERROR)
          .setTitle('🚨 RapidEx System Alert')
          .setDescription(message)
          .setFooter({ text: 'RapidEx · Admin Alert' })
          .setTimestamp(),
      ],
    });
  } catch (err) {
    logger.error({ err }, 'Failed to send admin alert');
  }
}
