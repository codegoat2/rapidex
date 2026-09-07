/**
 * Dashboard REST API — all JSON endpoints consumed by the frontend.
 *
 * All routes are under /dashboard/api/ and require the session cookie.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/client';
import { getAllSettings, setSettings, setSetting } from '../admin/settingsService';
import { getAllBalances, getBalance } from '../ledger/ledgerService';
import { getTradesByStatus, getActiveTrades } from '../engine/tradeService';
import {
  verifyExchanger,
  banExchanger,
  getExchangerByDiscordId,
  getExchangerById,
} from '../admin/exchangerService';
import {
  adminCredit,
  adminDebit,
  InsufficientBalanceError,
} from '../ledger/ledgerService';
import { manualAdjustmentKey } from '../security/idempotency';
import { provisionAddresses } from '../wallet/addressService';
import { logger } from '../utils/logger';
import type { Asset } from '../types';

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown) { res.json({ ok: true, data }); }
function err(res: Response, message: string, status = 400) {
  res.status(status).json({ ok: false, error: message });
}

// ── Overview ───────────────────────────────────────────────────────────────

router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const [
      tradeCounts,
      exchangerCount,
      webhookCount,
      ledgerTotals,
      recentTrades,
    ] = await Promise.all([
      db<{ status: string; count: string }[]>`
        SELECT status, COUNT(*)::text AS count FROM trades GROUP BY status`,
      db<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM exchangers WHERE is_active=TRUE AND is_banned=FALSE`,
      db<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM webhook_events WHERE processed=TRUE`,
      db<{ asset: string; type: string; total: string }[]>`
        SELECT asset, type, SUM(amount)::text AS total
        FROM ledger_entries GROUP BY asset, type ORDER BY asset`,
      db<{ id: string; status: string; asset: string; amount: string; user_discord_id: string; created_at: Date }[]>`
        SELECT id, status, asset, amount, user_discord_id, created_at
        FROM trades ORDER BY created_at DESC LIMIT 10`,
    ]);

    ok(res, { tradeCounts, exchangerCount: exchangerCount[0]?.count ?? '0', webhookCount: webhookCount[0]?.count ?? '0', ledgerTotals, recentTrades });
  } catch (e) { err(res, String(e), 500); }
});

// ── Trades ─────────────────────────────────────────────────────────────────

router.get('/trades', async (req: Request, res: Response) => {
  try {
    const status = req.query['status'] as string | undefined;
    const limit  = Math.min(parseInt(String(req.query['limit'] ?? '50')), 200);
    const page   = Math.max(parseInt(String(req.query['page'] ?? '0')), 0);

    const rows = status
      ? await db`SELECT * FROM trades WHERE status=${status} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${page * limit}`
      : await db`SELECT * FROM trades ORDER BY created_at DESC LIMIT ${limit} OFFSET ${page * limit}`;

    const [{ total }] = await db<[{ total: string }]>`
      SELECT COUNT(*)::text AS total FROM trades ${status ? db`WHERE status=${status}` : db``}`;

    ok(res, { trades: rows, total, page, limit });
  } catch (e) { err(res, String(e), 500); }
});

router.get('/trades/:id', async (req: Request, res: Response) => {
  try {
    const [trade] = await db`SELECT * FROM trades WHERE id=${req.params['id']}`;
    if (!trade) return err(res, 'Not found', 404);
    const logs = await db`SELECT * FROM trade_logs WHERE trade_id=${req.params['id']} ORDER BY created_at ASC`;
    ok(res, { trade, logs });
  } catch (e) { err(res, String(e), 500); }
});

// ── Exchangers ─────────────────────────────────────────────────────────────

router.get('/exchangers', async (_req: Request, res: Response) => {
  try {
    const exchangers = await db`SELECT * FROM exchangers ORDER BY created_at DESC`;
    ok(res, exchangers);
  } catch (e) { err(res, String(e), 500); }
});

router.get('/exchangers/:id', async (req: Request, res: Response) => {
  try {
    const ex = await getExchangerById(req.params['id']);
    if (!ex) return err(res, 'Not found', 404);
    const [addresses, balances, trades] = await Promise.all([
      db`SELECT * FROM deposit_addresses WHERE exchanger_id=${ex.id}`,
      getAllBalances(ex.id),
      db`SELECT * FROM trades WHERE exchanger_id=${ex.id} ORDER BY created_at DESC LIMIT 20`,
    ]);
    ok(res, { exchanger: ex, addresses, balances, trades });
  } catch (e) { err(res, String(e), 500); }
});

router.post('/exchangers/verify', async (req: Request, res: Response) => {
  try {
    const { targetDiscordId, targetUsername } = req.body as { targetDiscordId: string; targetUsername: string };
    if (!targetDiscordId || !targetUsername) return err(res, 'targetDiscordId and targetUsername required');
    const result = await verifyExchanger({
      targetDiscordId,
      targetUsername,
      adminDiscordId: 'DASHBOARD',
    });
    ok(res, result);
  } catch (e) { err(res, String(e), 500); }
});

router.post('/exchangers/ban', async (req: Request, res: Response) => {
  try {
    const { targetDiscordId, reason } = req.body as { targetDiscordId: string; reason: string };
    if (!targetDiscordId || !reason) return err(res, 'targetDiscordId and reason required');
    const result = await banExchanger({ targetDiscordId, adminDiscordId: 'DASHBOARD', reason });
    ok(res, result);
  } catch (e) { err(res, String(e), 500); }
});

// ── Ledger ─────────────────────────────────────────────────────────────────

router.get('/ledger', async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(parseInt(String(req.query['limit'] ?? '100')), 500);
    const page   = Math.max(parseInt(String(req.query['page'] ?? '0')), 0);
    const asset  = req.query['asset'] as string | undefined;
    const exchId = req.query['exchanger_id'] as string | undefined;
    const from   = req.query['from'] as string | undefined;
    const to     = req.query['to'] as string | undefined;

    const rows = await db`
      SELECT le.*, e.discord_username
      FROM ledger_entries le
      JOIN exchangers e ON e.id = le.exchanger_id
      WHERE TRUE
        ${asset  ? db`AND le.asset=${asset}` : db``}
        ${exchId ? db`AND le.exchanger_id=${exchId}` : db``}
        ${from   ? db`AND le.created_at >= ${from}::date` : db``}
        ${to     ? db`AND le.created_at < (${to}::date + INTERVAL '1 day')` : db``}
      ORDER BY le.created_at DESC
      LIMIT ${limit} OFFSET ${page * limit}
    `;
    ok(res, { entries: rows, page, limit });
  } catch (e) { err(res, String(e), 500); }
});

router.post('/ledger/credit', async (req: Request, res: Response) => {
  try {
    const { exchangerId, asset, amount, reason } = req.body as {
      exchangerId: string; asset: Asset; amount: string; reason: string;
    };
    if (!exchangerId || !asset || !amount || !reason) return err(res, 'All fields required');
    const key = manualAdjustmentKey(exchangerId, 'MANUAL_CREDIT', 'DASHBOARD', Date.now());
    const entry = await adminCredit({ exchangerId, asset, amount, reference: reason, idempotencyKey: key });
    await db`INSERT INTO audit_logs (actor_discord_id, action, entity_type, entity_id, metadata)
             VALUES ('DASHBOARD','MANUAL_CREDIT','exchanger',${exchangerId},${JSON.stringify({ asset, amount, reason })}::jsonb)`;
    ok(res, entry);
  } catch (e) { err(res, String(e), 500); }
});

router.post('/ledger/debit', async (req: Request, res: Response) => {
  try {
    const { exchangerId, asset, amount, reason } = req.body as {
      exchangerId: string; asset: Asset; amount: string; reason: string;
    };
    if (!exchangerId || !asset || !amount || !reason) return err(res, 'All fields required');
    const key = manualAdjustmentKey(exchangerId, 'MANUAL_DEBIT', 'DASHBOARD', Date.now());
    const entry = await adminDebit({ exchangerId, asset, amount, reference: reason, idempotencyKey: key });
    await db`INSERT INTO audit_logs (actor_discord_id, action, entity_type, entity_id, metadata)
             VALUES ('DASHBOARD','MANUAL_DEBIT','exchanger',${exchangerId},${JSON.stringify({ asset, amount, reason })}::jsonb)`;
    ok(res, entry);
  } catch (e) {
    if (e instanceof InsufficientBalanceError) return err(res, e.message);
    err(res, String(e), 500);
  }
});

// ── Audit Log ──────────────────────────────────────────────────────────────

router.get('/audit', async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(parseInt(String(req.query['limit'] ?? '100')), 500);
    const page   = Math.max(parseInt(String(req.query['page'] ?? '0')), 0);
    const action = req.query['action'] as string | undefined;

    const rows = await db`
      SELECT * FROM audit_logs
      WHERE TRUE ${action ? db`AND action=${action}` : db``}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${page * limit}
    `;
    ok(res, { entries: rows, page, limit });
  } catch (e) { err(res, String(e), 500); }
});

// ── Webhook Events ─────────────────────────────────────────────────────────

router.get('/webhooks', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query['limit'] ?? '50')), 200);
    const page  = Math.max(parseInt(String(req.query['page'] ?? '0')), 0);
    const rows  = await db`
      SELECT id, provider, event_id, processed, processed_at, error, created_at
      FROM webhook_events ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${page * limit}
    `;
    ok(res, { events: rows, page, limit });
  } catch (e) { err(res, String(e), 500); }
});

// ── Withdrawal Queue ─────────────────────────────────────────────────────

router.get('/withdrawals', async (req: Request, res: Response) => {
  try {
    const status = req.query['status'] as string | undefined;
    const rows = await db`
      SELECT w.*, t.user_discord_id, t.status AS trade_status
      FROM withdrawals w
      LEFT JOIN trades t ON t.id = w.trade_id
      ${status ? db`WHERE w.status=${status}` : db``}
      ORDER BY w.created_at DESC LIMIT 200
    `;
    ok(res, rows);
  } catch (e) { err(res, String(e), 500); }
});

router.post('/withdrawals/:id/retry', async (req: Request, res: Response) => {
  try {
    const [row] = await db`
      UPDATE withdrawals
      SET status = 'PENDING', next_attempt_at = NOW(), last_error = NULL, updated_at = NOW()
      WHERE id=${req.params['id']} AND status IN ('FAILED', 'BROADCAST')
      RETURNING id, status
    `;
    if (!row) return err(res, 'Withdrawal is not retryable', 409);
    ok(res, row);
  } catch (e) { err(res, String(e), 500); }
});

// ── Fee Config ─────────────────────────────────────────────────────────────

router.get('/fees', async (_req: Request, res: Response) => {
  try {
    const rows = await db`SELECT * FROM fee_config ORDER BY asset`;
    ok(res, rows);
  } catch (e) { err(res, String(e), 500); }
});

router.post('/fees', async (req: Request, res: Response) => {
  try {
    const { asset, fee_percentage, min_fee_amount } = req.body as {
      asset: string; fee_percentage: string; min_fee_amount: string;
    };
    if (!asset) return err(res, 'asset required');
    await db`
      UPDATE fee_config
      SET fee_percentage=${fee_percentage}, min_fee_amount=${min_fee_amount},
          updated_by_discord_id='DASHBOARD', updated_at=NOW()
      WHERE asset=${asset}
    `;
    ok(res, { updated: asset });
  } catch (e) { err(res, String(e), 500); }
});

// ── Hot Wallets ────────────────────────────────────────────────────────────

router.get('/hot-wallets', async (_req: Request, res: Response) => {
  try {
    const rows = await db`SELECT * FROM hot_wallet_balances ORDER BY asset`;
    ok(res, rows);
  } catch (e) { err(res, String(e), 500); }
});

// ── Settings ───────────────────────────────────────────────────────────────

router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await getAllSettings();
    ok(res, settings);
  } catch (e) { err(res, String(e), 500); }
});

router.post('/settings', async (req: Request, res: Response) => {
  try {
    const updates = req.body as Record<string, string>;
    if (!updates || typeof updates !== 'object') return err(res, 'Body must be a JSON object of key:value pairs');
    await setSettings(updates, 'DASHBOARD');
    ok(res, { updated: Object.keys(updates).length });
  } catch (e) { err(res, String(e), 500); }
});

router.post('/settings/:key', async (req: Request, res: Response) => {
  try {
    const { value } = req.body as { value: string };
    if (value === undefined) return err(res, 'value required');
    await setSetting(req.params['key']!, String(value), 'DASHBOARD');
    ok(res, { key: req.params['key'], value });
  } catch (e) { err(res, String(e), 500); }
});

// ── Deposit Addresses ──────────────────────────────────────────────────────

router.get('/addresses', async (req: Request, res: Response) => {
  try {
    const exchId = req.query['exchanger_id'] as string | undefined;
    const rows = exchId
      ? await db`SELECT * FROM deposit_addresses WHERE exchanger_id=${exchId} ORDER BY asset`
      : await db`SELECT da.*, e.discord_username FROM deposit_addresses da JOIN exchangers e ON e.id=da.exchanger_id ORDER BY da.asset`;
    ok(res, rows);
  } catch (e) { err(res, String(e), 500); }
});

router.post('/addresses/provision', async (req: Request, res: Response) => {
  try {
    const { exchangerId } = req.body as { exchangerId: string };
    if (!exchangerId) return err(res, 'exchangerId required');
    const addresses = await provisionAddresses(exchangerId);
    ok(res, addresses);
  } catch (e) { err(res, String(e), 500); }
});

// ── DB Stats ───────────────────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [trades, exchangers, ledger, webhooks] = await Promise.all([
      db<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM trades`,
      db<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM exchangers`,
      db<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM ledger_entries`,
      db<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM webhook_events`,
    ]);
    ok(res, {
      trades:    trades[0]?.count ?? '0',
      exchangers:exchangers[0]?.count ?? '0',
      ledger:    ledger[0]?.count ?? '0',
      webhooks:  webhooks[0]?.count ?? '0',
    });
  } catch (e) { err(res, String(e), 500); }
});

// ── Chart data (trades over time, asset distribution) ────────────────────

router.get('/charts/trades', async (req: Request, res: Response) => {
  try {
    const days = Math.min(parseInt(String(req.query['days'] ?? '30')), 365);
    const rows = await db<{ day: string; status: string; count: string }[]>`
      SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
             status, COUNT(*)::text AS count
      FROM trades
      WHERE created_at > NOW() - INTERVAL '${db(days + ' days')}'
      GROUP BY 1, 2 ORDER BY 1
    `;
    ok(res, rows);
  } catch (e) { err(res, String(e), 500); }
});

router.get('/charts/ledger', async (req: Request, res: Response) => {
  try {
    const days = Math.min(parseInt(String(req.query['days'] ?? '30')), 365);
    const rows = await db<{ day: string; asset: string; type: string; total: string }[]>`
      SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
             asset, type, SUM(amount)::text AS total
      FROM ledger_entries
      WHERE created_at > NOW() - INTERVAL '${db(days + ' days')}'
      GROUP BY 1, 2, 3 ORDER BY 1
    `;
    ok(res, rows);
  } catch (e) { err(res, String(e), 500); }
});

// ── CSV Export ────────────────────────────────────────────────────────────

router.get('/export/trades', async (req: Request, res: Response) => {
  try {
    const status = req.query['status'] as string | undefined;
    const rows = status
      ? await db`SELECT * FROM trades WHERE status=${status} ORDER BY created_at DESC LIMIT 5000`
      : await db`SELECT * FROM trades ORDER BY created_at DESC LIMIT 5000`;
    const headers = ['id','user_discord_id','exchanger_id','asset','amount','fiat_currency','fiat_method','direction','status','created_at'];
    const csv = [headers.join(',')].concat(rows.map((r: any) =>
      headers.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(',')
    )).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=trades-'+Date.now()+'.csv');
    res.send(csv);
  } catch (e) { err(res, String(e), 500); }
});

router.get('/export/ledger', async (_req: Request, res: Response) => {
  try {
    const rows = await db`SELECT * FROM ledger_entries ORDER BY created_at DESC LIMIT 10000`;
    const headers = ['id','exchanger_id','type','asset','amount','balance_after','escrow_after','reference','created_at'];
    const csv = [headers.join(',')].concat(rows.map((r: any) =>
      headers.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(',')
    )).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=ledger-'+Date.now()+'.csv');
    res.send(csv);
  } catch (e) { err(res, String(e), 500); }
});

// ── System health ─────────────────────────────────────────────────────────

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const start = Date.now();
    await db`SELECT 1`;
    const dbLatency = Date.now() - start;
    ok(res, {
      db: { healthy: true, latencyMs: dbLatency },
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (e) { err(res, String(e), 500); }
});

// ── Search (global) ───────────────────────────────────────────────────────

router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = String(req.query['q'] ?? '').trim();
    if (q.length < 2) return ok(res, { trades: [], exchangers: [], ledger: [] });
    const like = '%'+q+'%';
    const [trades, exchangers, ledger] = await Promise.all([
      db`SELECT id, status, asset, amount, user_discord_id, created_at FROM trades
         WHERE id::text ILIKE ${like} OR user_discord_id ILIKE ${like}
         ORDER BY created_at DESC LIMIT 10`,
      db`SELECT id, discord_id, discord_username, is_active, is_banned FROM exchangers
         WHERE discord_id ILIKE ${like} OR discord_username ILIKE ${like}
         LIMIT 10`,
      db`SELECT id, exchanger_id, type, asset, amount, reference, created_at FROM ledger_entries
         WHERE reference ILIKE ${like} OR idempotency_key ILIKE ${like}
         ORDER BY created_at DESC LIMIT 10`,
    ]);
    ok(res, { trades, exchangers, ledger });
  } catch (e) { err(res, String(e), 500); }
});

// ── Force release / cancel a trade (admin actions) ────────────────────────

router.post('/trades/:id/force-release', async (req: Request, res: Response) => {
  try {
    const { actorDiscordId } = req.body as { actorDiscordId?: string };
    const { forceRelease } = await import('../engine/tradeService');
    await forceRelease({ tradeId: req.params['id']!, actorDiscordId: actorDiscordId ?? 'DASHBOARD' });
    ok(res, { ok: true });
  } catch (e) { err(res, String(e), 500); }
});

router.post('/trades/:id/force-cancel', async (req: Request, res: Response) => {
  try {
    const { actorDiscordId } = req.body as { actorDiscordId?: string };
    const { forceCancel } = await import('../engine/tradeService');
    await forceCancel({ tradeId: req.params['id']!, actorDiscordId: actorDiscordId ?? 'DASHBOARD' });
    ok(res, { ok: true });
  } catch (e) { err(res, String(e), 500); }
});

// ── Exchanger reactivation ────────────────────────────────────────────────

router.post('/exchangers/:id/reactivate', async (req: Request, res: Response) => {
  try {
    const { reactivateExchanger } = await import('../admin/exchangerService');
    const result = await reactivateExchanger({
      exchangerId: req.params['id']!,
      adminDiscordId: 'DASHBOARD',
    });
    ok(res, result);
  } catch (e) { err(res, String(e), 500); }
});

// ── System info ───────────────────────────────────────────────────────────

router.get('/system', async (_req: Request, res: Response) => {
  try {
    const mem = process.memoryUsage();
    ok(res, {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      },
      env: process.env['NODE_ENV'] ?? 'development',
    });
  } catch (e) { err(res, String(e), 500); }
});

export default router;
