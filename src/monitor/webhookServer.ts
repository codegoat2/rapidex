/**
 * Webhook HTTP server — receives deposit notifications from:
 *   BlockCypher  (BTC / LTC)
 *   Alchemy      (ETH / ERC-20 USDT, USDC)
 *   Helius       (SOL / SPL USDC)
 *
 * Flow for every incoming webhook:
 *   1. Verify provider signature
 *   2. Idempotency check (webhook_events table)
 *   3. Record raw event
 *   4. Route to deposit processor
 *   5. Write audit log on error
 *
 * All routes are registered on a single Express app.
 * In production this runs on WEBHOOK_PORT behind a TLS reverse proxy
 * (handled by Railway/Fly.io ingress).
 */

import express, { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { checkWebhookRateLimit } from '../security/rateLimiter';
import { processDeposit } from './depositProcessor';

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

export function createWebhookApp(): express.Application {
  const app = express();

  // Raw body needed for signature verification — parse before JSON
  app.use(
    express.raw({ type: 'application/json', limit: '1mb' }),
  );

  // Rate limit all webhook routes
  app.use((req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? 'unknown';
    if (!checkWebhookRateLimit(ip)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  });

  // ---- BlockCypher (BTC / LTC) -------------------------------------------
  app.post('/webhooks/blockcypher', async (req: Request, res: Response) => {
    try {
      const rawBody = req.body as Buffer;

      if (!verifyBlockcypherSignature(rawBody, req.headers)) {
        logger.warn('BlockCypher webhook: invalid signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      const eventId = String(payload['hash'] ?? payload['id'] ?? generateFallbackId(rawBody));

      res.status(200).json({ ok: true }); // Acknowledge immediately

      // Process async — don't block the response
      setImmediate(() => {
        void processDeposit({
          provider: 'BLOCKCYPHER',
          eventId,
          rawPayload: payload,
        });
      });
    } catch (err) {
      logger.error({ err }, 'BlockCypher webhook handler error');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ---- Alchemy (ETH / ERC-20) --------------------------------------------
  app.post('/webhooks/alchemy', async (req: Request, res: Response) => {
    try {
      const rawBody = req.body as Buffer;

      if (!verifyAlchemySignature(rawBody, req.headers)) {
        logger.warn('Alchemy webhook: invalid signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      const eventId = String(
        (payload['id'] as string | undefined) ??
        ((payload['event'] as Record<string, unknown> | undefined)?.['transaction'] as Record<string, unknown> | undefined)?.['hash'] ??
        generateFallbackId(rawBody),
      );

      res.status(200).json({ ok: true });

      setImmediate(() => {
        void processDeposit({
          provider: 'ALCHEMY',
          eventId,
          rawPayload: payload,
        });
      });
    } catch (err) {
      logger.error({ err }, 'Alchemy webhook handler error');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ---- Helius (SOL / SPL) -------------------------------------------------
  app.post('/webhooks/helius', async (req: Request, res: Response) => {
    try {
      const rawBody = req.body as Buffer;

      if (!verifyHeliusSignature(rawBody, req.headers)) {
        logger.warn('Helius webhook: invalid signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      // Helius sends arrays; wrap single event or iterate
      const events = Array.isArray(payload) ? payload as Record<string, unknown>[] : [payload];

      res.status(200).json({ ok: true });

      for (const event of events) {
        const eventId = String(event['signature'] ?? generateFallbackId(Buffer.from(JSON.stringify(event))));
        setImmediate(() => {
          void processDeposit({
            provider: 'HELIUS',
            eventId,
            rawPayload: event,
          });
        });
      }
    } catch (err) {
      logger.error({ err }, 'Helius webhook handler error');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ---- Health check -------------------------------------------------------
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      const { getHealthStatus } = await import('./healthCheck');
      const status = await getHealthStatus();
      res.status(status.status === 'unhealthy' ? 503 : 200).json(status);
    } catch {
      res.status(200).json({ status: 'ok', service: 'rapidex-webhooks' });
    }
  });

  return app;
}

export function startWebhookServer(): void {
  const app = createWebhookApp();
  const port = config.WEBHOOK_PORT;

  app.listen(port, () => {
    logger.info({ port }, 'Webhook server listening');
  });
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifyBlockcypherSignature(body: Buffer, headers: Record<string, unknown>): boolean {
  // BlockCypher sends X-EventToken header containing the token
  const token = headers['x-eventtoken'] as string | undefined;
  if (!token) return false;
  // BlockCypher uses a shared token — compare with configured secret
  try {
    return timingSafeEqual(
      Buffer.from(token),
      Buffer.from(config.BLOCKCYPHER_WEBHOOK_SECRET),
    );
  } catch {
    return false;
  }
}

function verifyAlchemySignature(body: Buffer, headers: Record<string, unknown>): boolean {
  // Alchemy signs with HMAC-SHA256 using the signing key
  const signature = headers['x-alchemy-signature'] as string | undefined;
  if (!signature) return false;

  const hmac = createHmac('sha256', config.ALCHEMY_WEBHOOK_AUTH_TOKEN);
  hmac.update(body);
  const expected = hmac.digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function verifyHeliusSignature(body: Buffer, headers: Record<string, unknown>): boolean {
  // Helius uses the authorization header with the webhook secret
  const auth = headers['authorization'] as string | undefined;
  if (!auth) return false;

  try {
    return timingSafeEqual(
      Buffer.from(auth),
      Buffer.from(config.HELIUS_WEBHOOK_SECRET),
    );
  } catch {
    return false;
  }
}

function generateFallbackId(body: Buffer): string {
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}
