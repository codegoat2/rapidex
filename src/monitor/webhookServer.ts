/**
 * Main HTTP server — single Express app serving:
 *
 *   /webhooks/nownodes   → deposit webhook (NOWNodes callback)
 *   /health              → health check (Railway probe)
 *   /dashboard/*         → admin dashboard SPA + API
 *
 * All on a single port so Railway needs only one service.
 */

import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { timingSafeEqual, createHmac } from 'crypto';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { checkWebhookRateLimit } from '../security/rateLimiter';
import { processDeposit } from './depositProcessor';
import dashboardRouter from '../dashboard/dashboardRouter';
import { getHealthStatus } from './healthCheck';

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function createWebhookApp(): express.Application {
  const app = express();

  // Raw body for webhook signature verification (must come before JSON parser)
  app.use('/webhooks', express.raw({ type: 'application/json', limit: '2mb' }));

  // JSON + form for dashboard
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // ── Rate limit all incoming requests ──────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? 'unknown';
    if (req.path.startsWith('/webhooks') && !checkWebhookRateLimit(ip)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  });

  // ── NOWNodes webhook ──────────────────────────────────────────────────
  // NOWNodes sends a POST to your callback URL with a JSON body.
  // Auth: HMAC-SHA256 of raw body using WEBHOOK_SECRET, in X-Nownodes-Signature header.
  // Fallback: if the header is absent, compare Authorization: Bearer <WEBHOOK_SECRET>
  app.post('/webhooks/nownodes', async (req: Request, res: Response) => {
    try {
      const rawBody = req.body as Buffer;

      if (!verifyNowNodesSignature(rawBody, req.headers)) {
        logger.warn({}, 'NOWNodes webhook: invalid signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;

      // NOWNodes address-activity event — extract tx hash as event ID
      const txId = String(
        payload['txid'] ?? payload['hash'] ?? payload['tx'] ?? generateFallbackId(rawBody),
      );

      // Acknowledge immediately — process async
      res.status(200).json({ ok: true });

      setImmediate(() => {
        void processDeposit({
          provider:   'BLOCKCYPHER',   // reuse BLOCKCYPHER parser — same UTXO format
          eventId:    txId,
          rawPayload: payload,
        });
      });
    } catch (err) {
      logger.error({ err }, 'NOWNodes webhook error');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Health check ──────────────────────────────────────────────────────
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      const status = await getHealthStatus();
      res.status(status.status === 'unhealthy' ? 503 : 200).json(status);
    } catch {
      res.json({ status: 'ok' });
    }
  });

  // ── Admin Dashboard ───────────────────────────────────────────────────
  app.use('/dashboard', dashboardRouter);

  // Root redirect to dashboard
  app.get('/', (_req: Request, res: Response) => {
    res.redirect('/dashboard/');
  });

  return app;
}

export function startWebhookServer(): void {
  const app  = createWebhookApp();
  const port = config.WEBHOOK_PORT;

  app.listen(port, () => {
    logger.info({ port }, `HTTP server listening — dashboard: http://localhost:${port}/dashboard/`);
  });
}

// ---------------------------------------------------------------------------
// Signature helpers
// ---------------------------------------------------------------------------

function verifyNowNodesSignature(body: Buffer, headers: Record<string, unknown>): boolean {
  // Try HMAC-SHA256 header first
  const sig = headers['x-nownodes-signature'] as string | undefined;
  if (sig) {
    const expected = createHmac('sha256', config.WEBHOOK_SECRET).update(body).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  // Fallback: Bearer token in Authorization header
  const auth = headers['authorization'] as string | undefined;
  if (auth?.startsWith('Bearer ')) {
    try {
      return timingSafeEqual(
        Buffer.from(auth.slice(7)),
        Buffer.from(config.WEBHOOK_SECRET),
      );
    } catch {
      return false;
    }
  }

  // If no signature at all, reject in production
  return config.NODE_ENV !== 'production';
}

function generateFallbackId(body: Buffer): string {
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}
