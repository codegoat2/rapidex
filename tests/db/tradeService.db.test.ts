/**
 * DB integration tests — Trade Service (state machine)
 *
 * Tests:
 *   - createTrade inserts with OPEN status
 *   - transitionTrade follows allowed transitions
 *   - transitionTrade rejects invalid transitions
 *   - Double-claim: concurrent claims on same trade — only one wins
 *   - trade_logs entry written on every transition
 *   - getTradeByChannelId lookup
 */

import { randomUUID } from 'crypto';
import postgres from 'postgres';
import {
  createTrade,
  transitionTrade,
  getTradeById,
  getTradeByChannelId,
  getTradeLog,
  InvalidTransitionError,
} from '../../src/engine/tradeService';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL must be set to run DB integration tests');
}

const sql = postgres(DATABASE_URL, {
  ssl: process.env['NODE_ENV'] === 'production' ? 'require' : 'prefer',
  max: 5,
});

// Create a minimal exchanger record for FK constraints
async function createTestExchanger(): Promise<{ exchangerId: string; userId: string }> {
  const did = `trade-test-${randomUUID()}`;
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (discord_id, discord_username) VALUES (${did}, 'TradeTestUser') RETURNING id
  `;
  const [ex] = await sql<{ id: string }[]>`
    INSERT INTO exchangers (user_id, discord_id, discord_username, verified_by_discord_id)
    VALUES (${user.id}, ${did}, 'TradeTestUser', 'SYSTEM') RETURNING id
  `;
  return { exchangerId: ex.id, userId: user.id };
}

async function cleanupTrade(tradeId: string): Promise<void> {
  await sql`DELETE FROM trade_logs WHERE trade_id = ${tradeId}`;
  await sql`DELETE FROM trades WHERE id = ${tradeId}`;
}

async function cleanupExchanger(exchangerId: string, userId: string): Promise<void> {
  await sql`DELETE FROM exchangers WHERE id = ${exchangerId}`;
  await sql`DELETE FROM users WHERE id = ${userId}`;
}

describe('Trade service DB integration', () => {
  let exchangerId: string;
  let userId: string;

  beforeAll(async () => {
    const ex = await createTestExchanger();
    exchangerId = ex.exchangerId;
    userId      = ex.userId;
  });

  afterAll(async () => {
    await cleanupExchanger(exchangerId, userId);
    await sql.end();
  });

  // ------------------------------------------------------------------
  test('createTrade inserts with OPEN status and correct fields', async () => {
    const channelId = `ch-${randomUUID()}`;
    const trade = await createTrade({
      userDiscordId:   'user-001',
      asset:           'BTC',
      amount:          '0.1',
      fiatCurrency:    'EUR',
      fiatMethod:      'REVOLUT',
      direction:       'BUY',
      ticketChannelId: channelId,
    });

    expect(trade.status).toBe('OPEN');
    expect(trade.asset).toBe('BTC');
    expect(parseFloat(trade.amount)).toBeCloseTo(0.1, 8);
    expect(trade.ticket_channel_id).toBe(channelId);
    expect(trade.exchanger_id).toBeNull();

    await cleanupTrade(trade.id);
  });

  // ------------------------------------------------------------------
  test('transitionTrade follows allowed transitions and writes trade_log', async () => {
    const trade = await createTrade({
      userDiscordId: 'user-002', asset: 'ETH', amount: '0.5',
      fiatCurrency: 'USD', fiatMethod: 'WISE', direction: 'SELL',
      ticketChannelId: `ch-${randomUUID()}`,
    });

    const claimed = await transitionTrade({
      tradeId: trade.id, to: 'CLAIMED', actorDiscordId: 'exchanger-001',
      updates: { exchangerId, claimedAt: new Date() },
    });
    expect(claimed.status).toBe('CLAIMED');

    const fiatPending = await transitionTrade({
      tradeId: trade.id, to: 'FIAT_PENDING', actorDiscordId: 'exchanger-001',
    });
    expect(fiatPending.status).toBe('FIAT_PENDING');

    // Verify trade_logs entries exist
    const logs = await getTradeLog(trade.id);
    const statuses = logs.map(l => l.to_status);
    expect(statuses).toContain('OPEN');
    expect(statuses).toContain('CLAIMED');
    expect(statuses).toContain('FIAT_PENDING');

    await cleanupTrade(trade.id);
  });

  // ------------------------------------------------------------------
  test('transitionTrade throws InvalidTransitionError for invalid transition', async () => {
    const trade = await createTrade({
      userDiscordId: 'user-003', asset: 'LTC', amount: '1.0',
      fiatCurrency: 'GBP', fiatMethod: 'BANK_TRANSFER', direction: 'BUY',
      ticketChannelId: `ch-${randomUUID()}`,
    });

    await expect(
      transitionTrade({
        tradeId: trade.id, to: 'COMPLETED', actorDiscordId: 'evil-actor',
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    // Status must not have changed
    const unchanged = await getTradeById(trade.id);
    expect(unchanged?.status).toBe('OPEN');

    await cleanupTrade(trade.id);
  });

  // ------------------------------------------------------------------
  test('concurrent claim attempts — only one wins (double-claim prevention)', async () => {
    const trade = await createTrade({
      userDiscordId: 'user-004', asset: 'BTC', amount: '0.05',
      fiatCurrency: 'EUR', fiatMethod: 'PAYPAL', direction: 'BUY',
      ticketChannelId: `ch-${randomUUID()}`,
    });

    // Create second exchanger
    const ex2 = await createTestExchanger();

    const results = await Promise.allSettled([
      transitionTrade({
        tradeId: trade.id, to: 'CLAIMED', actorDiscordId: 'ex-1',
        updates: { exchangerId, claimedAt: new Date() },
      }),
      transitionTrade({
        tradeId: trade.id, to: 'CLAIMED', actorDiscordId: 'ex-2',
        updates: { exchangerId: ex2.exchangerId, claimedAt: new Date() },
      }),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected  = results.filter(r => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    await cleanupTrade(trade.id);
    await cleanupExchanger(ex2.exchangerId, ex2.userId);
  });

  // ------------------------------------------------------------------
  test('getTradeByChannelId returns correct trade', async () => {
    const channelId = `ch-unique-${randomUUID()}`;
    const trade = await createTrade({
      userDiscordId: 'user-005', asset: 'BTC', amount: '0.01',
      fiatCurrency: 'EUR', fiatMethod: 'REVOLUT', direction: 'BUY',
      ticketChannelId: channelId,
    });

    const found = await getTradeByChannelId(channelId);
    expect(found?.id).toBe(trade.id);

    const notFound = await getTradeByChannelId('non-existent-channel');
    expect(notFound).toBeNull();

    await cleanupTrade(trade.id);
  });
});
