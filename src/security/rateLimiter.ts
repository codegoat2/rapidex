/**
 * In-process rate limiter using a sliding window counter.
 *
 * For production scale, swap the in-memory store for Redis,
 * but this covers the single-process Railway/Fly.io deployment.
 */

import { config } from '../config/env';
import { logger } from '../utils/logger';

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

// Clean up expired windows every 5 minutes to prevent memory leak
setInterval(
  () => {
    const now = Date.now();
    for (const [key, window] of store) {
      if (window.resetAt < now) store.delete(key);
    }
  },
  5 * 60 * 1000,
);

function check(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (entry.count >= limit) {
    logger.warn({ key }, 'Rate limit exceeded');
    return false; // denied
  }

  entry.count++;
  return true;
}

/**
 * Enforces ticket creation rate limit per user (per hour).
 * Returns false if the user has hit their limit.
 */
export function checkTicketRateLimit(discordId: string): boolean {
  return check(
    `ticket:${discordId}`,
    config.RATE_LIMIT_TICKET_PER_USER_PER_HOUR,
    60 * 60 * 1000,
  );
}

/**
 * Enforces general command rate limit per user (per minute).
 */
export function checkCommandRateLimit(discordId: string): boolean {
  return check(
    `cmd:${discordId}`,
    config.RATE_LIMIT_COMMANDS_PER_USER_PER_MINUTE,
    60 * 1000,
  );
}

/**
 * Enforces webhook processing rate limit per IP (per minute).
 */
export function checkWebhookRateLimit(ip: string): boolean {
  return check(`webhook:${ip}`, 120, 60 * 1000);
}
