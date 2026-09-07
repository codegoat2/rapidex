/**
 * Forum Service
 *
 * Manages forum threads for open trades.
 *
 *   postTradeToForum(trade)   — creates a new thread when a trade opens
 *   closeForumThread(tradeId) — locks + archives the thread when claimed/cancelled/expired
 *
 * The thread ID is stored in the `forum_thread_id` column on the trades table
 * (added by migration 009). If no forum channel is configured the functions
 * are no-ops so the bot works without a forum channel set.
 */

import { ChannelType, ForumChannel, ThreadChannel } from 'discord.js';
import { getDiscordClient } from '../client';
import { getForumChannelId } from '../../config/runtimeConfig';
import { buildForumEmbed, buildForumClaimRow, buildThreadName } from '../embeds/forumPost';
import { logger } from '../../utils/logger';
import { db } from '../../db/client';
import type { DbTrade } from '../../types';

/**
 * Posts a new forum thread for an open trade.
 * Stores the resulting thread ID on the trade row.
 */
export async function postTradeToForum(trade: DbTrade): Promise<void> {
  const forumChannelId = await getForumChannelId();
  if (!forumChannelId) return; // not configured — skip silently

  try {
    const client  = getDiscordClient();
    const channel = await client.channels.fetch(forumChannelId).catch(() => null);

    if (!channel || channel.type !== ChannelType.GuildForum) {
      logger.warn({ forumChannelId }, 'Forum channel not found or is not a Forum channel');
      return;
    }

    const forum = channel as ForumChannel;

    const thread = await forum.threads.create({
      name:    buildThreadName(trade).slice(0, 100), // Discord max 100 chars
      message: {
        embeds:     [buildForumEmbed(trade)],
        components: [buildForumClaimRow(trade.id)],
      },
    });

    // Persist the thread ID so we can lock it later
    await db`
      UPDATE trades
      SET forum_thread_id = ${thread.id}
      WHERE id = ${trade.id}
    `;

    logger.info({ tradeId: trade.id, threadId: thread.id }, 'Trade posted to forum');
  } catch (err) {
    // Non-fatal — trade still exists, forum post just failed
    logger.error({ err, tradeId: trade.id }, 'Failed to post trade to forum');
  }
}

/**
 * Locks and archives the forum thread when a trade is no longer open.
 * Called after claim, cancel, or expiry.
 */
export async function closeForumThread(
  tradeId: string,
  reason: 'CLAIMED' | 'CANCELLED' | 'EXPIRED',
): Promise<void> {
  try {
    const rows = await db<{ forum_thread_id: string | null }[]>`
      SELECT forum_thread_id FROM trades WHERE id = ${tradeId}
    `;
    const threadId = rows[0]?.forum_thread_id;
    if (!threadId) return;

    const client = getDiscordClient();
    const thread = await client.channels.fetch(threadId).catch(() => null);

    if (!thread || !(thread instanceof ThreadChannel)) return;

    const reasonLabel = {
      CLAIMED:   'Trade claimed by an exchanger',
      CANCELLED: 'Trade was cancelled',
      EXPIRED:   'Trade expired',
    }[reason];

    // Send a closing message then lock + archive
    await thread.send({
      content: `**Closed** — ${reasonLabel}.`,
    }).catch(() => undefined);

    await thread.setLocked(true,  reasonLabel).catch(() => undefined);
    await thread.setArchived(true, reasonLabel).catch(() => undefined);

    logger.info({ tradeId, threadId, reason }, 'Forum thread closed');
  } catch (err) {
    logger.warn({ err, tradeId }, 'Failed to close forum thread — non-fatal');
  }
}
