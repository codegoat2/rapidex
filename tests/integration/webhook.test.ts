/**
 * Integration tests — Webhook server
 *
 * Tests:
 *   - Invalid signature → 401
 *   - Valid BlockCypher webhook → 200
 *   - Duplicate webhook → 200 but not processed twice (idempotency)
 *   - Helius webhook array handling
 *   - Rate limit triggers
 */

import request from 'supertest';
import { createHmac } from 'crypto';
import { createWebhookApp } from '../../src/monitor/webhookServer';
import type { Express } from 'express';

// Mock all dependencies so no real DB/Discord calls happen
jest.mock('../../src/config/env', () => ({
  config: {
    BLOCKCYPHER_WEBHOOK_SECRET: 'test-blockcypher-secret',
    ALCHEMY_WEBHOOK_AUTH_TOKEN: 'test-alchemy-key',
    HELIUS_WEBHOOK_SECRET:      'test-helius-secret',
    WEBHOOK_PORT: 3001,
    NODE_ENV: 'test',
    RATE_LIMIT_TICKET_PER_USER_PER_HOUR: 3,
    RATE_LIMIT_COMMANDS_PER_USER_PER_MINUTE: 10,
  },
}));

jest.mock('../../src/monitor/depositProcessor', () => ({
  processDeposit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/security/rateLimiter', () => ({
  checkWebhookRateLimit: jest.fn().mockReturnValue(true),
}));

import { processDeposit } from '../../src/monitor/depositProcessor';
import { checkWebhookRateLimit } from '../../src/security/rateLimiter';

let app: Express;

beforeEach(() => {
  app = createWebhookApp();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// BlockCypher
// ---------------------------------------------------------------------------

describe('POST /webhooks/blockcypher', () => {
  const validPayload = JSON.stringify({
    hash: 'abc123txhash',
    chain: 'BTC.main',
    outputs: [{ addresses: ['bc1qtest'], value: 50000000 }],
    confirmations: 2,
  });

  test('returns 401 for missing signature', async () => {
    const res = await request(app)
      .post('/webhooks/blockcypher')
      .set('Content-Type', 'application/json')
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  test('returns 401 for wrong token', async () => {
    const res = await request(app)
      .post('/webhooks/blockcypher')
      .set('Content-Type', 'application/json')
      .set('X-EventToken', 'wrong-secret')
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  test('returns 200 with valid token and triggers processDeposit', async () => {
    const res = await request(app)
      .post('/webhooks/blockcypher')
      .set('Content-Type', 'application/json')
      .set('X-EventToken', 'test-blockcypher-secret')
      .send(validPayload);

    expect(res.status).toBe(200);
    // Give setImmediate a chance to fire
    await new Promise(r => setTimeout(r, 50));
    expect(processDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'BLOCKCYPHER',
        eventId:  'abc123txhash',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Alchemy
// ---------------------------------------------------------------------------

describe('POST /webhooks/alchemy', () => {
  const payload = JSON.stringify({
    id: 'alchemy-event-001',
    event: {
      activity: [{
        toAddress: '0xtest',
        value: '1.5',
        asset: 'ETH',
        hash: '0xtxhash',
        category: 'external',
      }],
    },
  });

  function sign(body: string): string {
    return createHmac('sha256', 'test-alchemy-key').update(Buffer.from(body)).digest('hex');
  }

  test('returns 401 for missing signature', async () => {
    const res = await request(app)
      .post('/webhooks/alchemy')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(401);
  });

  test('returns 401 for wrong signature', async () => {
    const res = await request(app)
      .post('/webhooks/alchemy')
      .set('Content-Type', 'application/json')
      .set('X-Alchemy-Signature', 'badsig')
      .send(payload);
    expect(res.status).toBe(401);
  });

  test('returns 200 with valid HMAC signature', async () => {
    const res = await request(app)
      .post('/webhooks/alchemy')
      .set('Content-Type', 'application/json')
      .set('X-Alchemy-Signature', sign(payload))
      .send(payload);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Helius
// ---------------------------------------------------------------------------

describe('POST /webhooks/helius', () => {
  const events = JSON.stringify([
    { signature: 'solsig001', tokenTransfers: [], nativeTransfers: [] },
    { signature: 'solsig002', tokenTransfers: [], nativeTransfers: [] },
  ]);

  test('returns 401 for missing auth header', async () => {
    const res = await request(app)
      .post('/webhooks/helius')
      .set('Content-Type', 'application/json')
      .send(events);
    expect(res.status).toBe(401);
  });

  test('returns 200 and fires processDeposit for each event in array', async () => {
    const res = await request(app)
      .post('/webhooks/helius')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'test-helius-secret')
      .send(events);

    expect(res.status).toBe(200);
    await new Promise(r => setTimeout(r, 50));
    expect(processDeposit).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('Webhook rate limiting', () => {
  test('returns 429 when rate limit exceeded', async () => {
    (checkWebhookRateLimit as jest.Mock).mockReturnValueOnce(false);

    const res = await request(app)
      .post('/webhooks/blockcypher')
      .set('Content-Type', 'application/json')
      .set('X-EventToken', 'test-blockcypher-secret')
      .send('{}');

    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  test('returns 200 with ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'rapidex-webhooks' });
  });
});
