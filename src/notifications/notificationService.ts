/**
 * Notification Service — Discord messages at every trade state transition.
 *
 * All functions are fire-and-forget safe (callers void them).
 * DM failures (user has DMs closed) are caught and logged — never throw.
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel } from 'discord.js';
import { getDiscordClient } from '../bot/client';
import { getTradeById } from '../engine/tradeService';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { COLORS } from '../bot/embeds/colors';
import { assetLabel, fiatMethodLabel } from '../bot/embeds/tradeEmbed';
import type { DbTrade } from '../types';

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
  await postCompletedTradeHistory(trade);

  // Auto-close ticket 5 minutes after completion
  void scheduleTicketAutoClose(trade);
}

async function postCompletedTradeHistory(trade: DbTrade): Promise<void> {
  try {
    const { getChannelHistory } = await import('../config/runtimeConfig');
    const channelId = await getChannelHistory();
    if (!channelId) return;

    const baseUrl = config.WEBHOOK_BASE_URL.replace(/\/$/, '');
    const transcriptUrl = `${baseUrl}/history/exchanges/${encodeURIComponent(trade.id)}`;
    const historyEmbed = new EmbedBuilder()
      .setColor(COLORS.COMPLETED)
      .setTitle('✅ Transaction Completed')
      .addFields(
        { name: '🔄 Exchange', value: `${trade.asset} → ${trade.fiat_currency}`, inline: true },
        { name: '💵 Amount', value: `\`${parseFloat(trade.amount).toFixed(8)} ${trade.asset}\``, inline: true },
        { name: '🎫 Ticket', value: `\`${trade.id}\``, inline: false },
      )
      .setFooter({ text: 'RapidEx · Powered by RapidEx' })
      .setTimestamp(trade.completed_at ?? new Date());

    const client = getDiscordClient();
    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel) return;
    await channel.send({
      embeds: [historyEmbed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('View Transcript')
          .setStyle(ButtonStyle.Link)
          .setURL(transcriptUrl),
      )],
    });
  } catch (err) {
    logger.warn({ err, tradeId: trade.id }, 'Failed to post completed trade history — non-fatal');
  }
}

// ---------------------------------------------------------------------------
// Auto-close ticket 5 minutes after trade completes — sends transcript first
// ---------------------------------------------------------------------------

async function scheduleTicketAutoClose(trade: DbTrade): Promise<void> {
  const DELAY_MS = 5 * 60 * 1000; // 5 minutes

  // Post countdown notice in the ticket channel immediately
  try {
    const client  = getDiscordClient();
    const ticketChannel = client.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
    if (ticketChannel) {
      await ticketChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('<:lock:1547331951877165128> Ticket Closing in 5 Minutes')
            .setDescription(
              'This trade has been completed.\n\n' +
              'A full transcript will be sent to the admin log and this channel will be deleted in **5 minutes**.\n\n' +
              'Save any information you need now.',
            )
            .setFooter({ text: 'RapidEx · Auto-Close' })
            .setTimestamp(),
        ],
      });
    }
  } catch (err) {
    logger.warn({ err, tradeId: trade.id }, 'Auto-close countdown notice failed — non-fatal');
  }

  await new Promise(r => setTimeout(r, DELAY_MS));

  try {
    await sendTicketTranscriptToAdminLog(trade);
  } catch (err) {
    logger.warn({ err, tradeId: trade.id }, 'Transcript post failed — non-fatal, still deleting channel');
  }

  try {
    const client  = getDiscordClient();
    const ticketChannel = client.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
    if (ticketChannel) {
      await ticketChannel.delete(`Auto-close — trade ${trade.id} completed`);
      logger.info({ tradeId: trade.id }, 'Ticket channel auto-closed after completion');
    }
  } catch (err) {
    logger.warn({ err, tradeId: trade.id }, 'Auto-close channel delete failed — non-fatal');
  }
}

async function sendTicketTranscriptToAdminLog(trade: DbTrade): Promise<void> {
  const { getChannelAdminAlerts } = await import('../config/runtimeConfig');
  const adminChannelId = await getChannelAdminAlerts();
  if (!adminChannelId) return;

  const client  = getDiscordClient();

  // Fetch the last 100 messages from the ticket channel for the transcript
  let transcriptLines: string[] = [];
  try {
    const ticketChannel = client.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
    if (ticketChannel) {
      const messages = await ticketChannel.messages.fetch({ limit: 100 });
      transcriptLines = [...messages.values()]
        .reverse()
        .map(m => {
          const ts   = `[${m.createdAt.toISOString().slice(11, 19)}]`;
          const who  = m.author.bot ? `[BOT] ${m.author.username}` : m.author.tag;
          const body = m.content || (m.embeds.length ? `[embed: ${m.embeds[0]?.title ?? 'no title'}]` : '[attachment/component]');
          return `${ts} ${who}: ${body}`;
        });
    }
  } catch (err) {
    logger.warn({ err, tradeId: trade.id }, 'Could not fetch messages for transcript');
  }

  const FIAT_SYM: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };
  const sym = FIAT_SYM[trade.fiat_currency] ?? trade.fiat_currency;
  const fiatPart = trade.fiat_amount
    ? `${sym}${parseFloat(trade.fiat_amount).toFixed(2)} → `
    : '';

  const transcriptText = transcriptLines.length
    ? transcriptLines.join('\n').slice(0, 3800) // embed description limit
    : '_No messages recorded_';

  const adminChannel = client.channels.cache.get(adminChannelId) as TextChannel | undefined;
  if (!adminChannel) return;

  const transcriptEmbed = new EmbedBuilder()
    .setColor(COLORS.COMPLETED)
    .setTitle('<:GreenCheckmark:1547332810048667659> Trade Transcript — Completed')
    .addFields(
      { name: '🆔 Trade ID',        value: `\`${trade.id}\``,                                              inline: false },
      { name: '👤 User',            value: `<@${trade.user_discord_id}>`,                                  inline: true  },
      { name: '💎 Asset',           value: `${fiatPart}${parseFloat(trade.amount).toFixed(8)} ${trade.asset}`, inline: true  },
      { name: '📋 Direction',       value: trade.direction,                                                 inline: true  },
      { name: '📅 Completed At',    value: trade.completed_at
          ? `<t:${Math.floor(new Date(trade.completed_at).getTime() / 1000)}:F>`
          : 'Unknown',                                                                                       inline: true  },
      { name: '📝 Transcript',      value: `\`\`\`\n${transcriptText}\n\`\`\``,                           inline: false },
    )
    .setFooter({ text: 'RapidEx · Auto-Close Transcript' })
    .setTimestamp();

  await adminChannel.send({ embeds: [transcriptEmbed] });
  logger.info({ tradeId: trade.id, adminChannelId }, 'Transcript sent to admin log');
}

// ---------------------------------------------------------------------------
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
