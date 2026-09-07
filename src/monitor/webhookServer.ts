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

  registerWebhook(app, '/webhooks/nownodes', 'BLOCKCYPHER', verifyNowNodesSignature);
  registerWebhook(app, '/webhooks/blockcypher', 'BLOCKCYPHER', verifyBlockcypherSignature);
  registerWebhook(app, '/webhooks/alchemy', 'ALCHEMY', verifyAlchemySignature);
  registerWebhook(app, '/webhooks/helius', 'HELIUS', verifyHeliusSignature);

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
    return safeEqual(sig, createHmac('sha256', config.WEBHOOK_SECRET).update(body).digest('hex'));
  }

  // Fallback: Bearer token in Authorization header
  const auth = headers['authorization'] as string | undefined;
  if (auth?.startsWith('Bearer ')) {
    return safeEqual(auth.slice(7), config.WEBHOOK_SECRET);
  }

  return false;
}

function registerWebhook(
  app: express.Application,
  path: string,
  provider: 'BLOCKCYPHER' | 'ALCHEMY' | 'HELIUS',
  verify: (body: Buffer, headers: Record<string, unknown>) => boolean,
): void {
  app.post(path, (req: Request, res: Response) => {
    try {
      const rawBody = req.body as Buffer;
      if (!Buffer.isBuffer(rawBody) || !verify(rawBody, req.headers)) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
      const payloads = Array.isArray(parsed) ? parsed : [parsed];
      res.status(200).json({ ok: true });

      setImmediate(() => {
        for (const value of payloads) {
          if (!value || typeof value !== 'object') continue;
          const payload = value as Record<string, unknown>;
          const eventId = String(
            payload['id'] ?? payload['signature'] ?? payload['txid'] ??
            payload['hash'] ?? payload['tx'] ?? generateFallbackId(Buffer.from(JSON.stringify(payload))),
          );
          void processDeposit({ provider, eventId, rawPayload: payload });
        }
      });
    } catch (err) {
      logger.error({ err, path }, 'Webhook error');
      res.status(400).json({ error: 'Invalid webhook payload' });
    }
  });
}

function verifyBlockcypherSignature(_body: Buffer, headers: Record<string, unknown>): boolean {
  return safeEqual(
    String(headers['x-eventtoken'] ?? ''),
    String((config as typeof config & { BLOCKCYPHER_WEBHOOK_SECRET?: string }).BLOCKCYPHER_WEBHOOK_SECRET ?? config.WEBHOOK_SECRET),
  );
}

function verifyAlchemySignature(body: Buffer, headers: Record<string, unknown>): boolean {
  const signature = String(headers['x-alchemy-signature'] ?? '');
  const secret = (config as typeof config & { ALCHEMY_WEBHOOK_AUTH_TOKEN?: string }).ALCHEMY_WEBHOOK_AUTH_TOKEN ?? config.WEBHOOK_SECRET;
  return safeEqual(signature, createHmac('sha256', secret).update(body).digest('hex'));
}

function verifyHeliusSignature(_body: Buffer, headers: Record<string, unknown>): boolean {
  const secret = (config as typeof config & { HELIUS_WEBHOOK_SECRET?: string }).HELIUS_WEBHOOK_SECRET ?? config.WEBHOOK_SECRET;
  const authorization = String(headers['authorization'] ?? '');
  return safeEqual(authorization.replace(/^Bearer\s+/i, ''), secret);
}

function safeEqual(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function generateFallbackId(body: Buffer): string {
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}
