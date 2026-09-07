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
    .setTitle('✋ Trade Claimed')
    .setDescription(`Your trade has been claimed by an exchanger. Check your ticket channel for payment instructions.`)
    .addFields(
      { name: 'Asset',  value: trade.asset,  inline: true },
      { name: 'Amount', value: parseFloat(trade.amount).toFixed(8), inline: true },
    )
    .setTimestamp();

  await postToChannel(trade.ticket_channel_id, embed);
  await dmUser(trade.user_discord_id, embed);
}

export async function notifyFiatSent(tradeId: string, _actorDiscordId: string): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade || !trade.exchanger_id) return;

  // Find exchanger discord_id
  const rows = await (await import('../db/client')).db<{ discord_id: string }[]>`
    SELECT discord_id FROM exchangers WHERE id = ${trade.exchanger_id}
  `;
  const exchangerDiscordId = rows[0]?.discord_id;
  if (!exchangerDiscordId) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('💳 Payment Sent')
    .setDescription('The user has confirmed their fiat payment has been sent. Please verify receipt and release the crypto.')
    .addFields({ name: 'Trade', value: `\`${trade.id}\``, inline: true })
    .setTimestamp();

  await postToChannel(trade.ticket_channel_id, embed);
  await dmUser(exchangerDiscordId, embed);
}

export async function notifyCryptoSent(tradeId: string, txId: string, explorerUrl: string): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('🚀 Crypto Sent!')
    .setDescription(`**${parseFloat(trade.amount).toFixed(8)} ${trade.asset}** has been sent to your wallet.`)
    .addFields(
      { name: '🔗 Transaction', value: `[\`${txId.slice(0, 20)}...\`](${explorerUrl})`, inline: false },
    )
    .setFooter({ text: 'Waiting for blockchain confirmation...' })
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
    .setDescription(`Your trade has been completed successfully. **${parseFloat(trade.amount).toFixed(8)} ${trade.asset}** confirmed on-chain.`)
    .addFields({ name: 'Trade ID', value: `\`${trade.id}\`` })
    .setTimestamp();

  await postToChannel(trade.ticket_channel_id, embed);
  await dmUser(trade.user_discord_id, embed);
}

export async function notifyTradeExpired(tradeId: string): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle('⏰ Trade Expired')
    .setDescription(`Your trade was not claimed by an exchanger within ${config.TIMEOUT_OPEN_MINUTES} minutes and has expired. You can open a new trade at any time.`)
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
    .setDescription('This trade has been cancelled. The exchanger\'s escrow has been released.')
    .addFields({ name: 'Trade ID', value: `\`${trade.id}\`` })
    .setTimestamp();

  await postToChannel(trade.ticket_channel_id, embed);
  await dmUser(trade.user_discord_id, embed);
}

export async function notifyDisputeRaised(tradeId: string, actorDiscordId: string): Promise<void> {
  const trade = await getTradeById(tradeId);
  if (!trade) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.DISPUTED)
    .setTitle('⚠️ Dispute Raised')
    .setDescription(`A dispute has been raised on this trade. An admin will review shortly.`)
    .addFields({ name: 'Raised by', value: `<@${actorDiscordId}>`, inline: true })
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
      .setTitle('💰 Deposit Credited')
      .setDescription(`**${parseFloat(amount).toFixed(8)} ${asset}** has been credited to your RapidEx balance.`)
      .addFields({ name: 'TX', value: `\`${txId.slice(0, 40)}\``, inline: false })
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
    const client  = getDiscordClient();
    const channel = client.channels.cache.get(config.CHANNEL_ADMIN_ALERTS) as TextChannel | undefined;
    if (!channel) {
      logger.warn({ channelId: config.CHANNEL_ADMIN_ALERTS }, 'Admin alerts channel not found');
      return;
    }
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.ERROR)
          .setTitle('🚨 RapidEx Alert')
          .setDescription(message)
          .setTimestamp(),
      ],
    });
  } catch (err) {
    logger.error({ err }, 'Failed to send admin alert');
  }
}
