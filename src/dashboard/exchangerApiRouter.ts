/**
 * Exchanger Dashboard REST API — all JSON endpoints consumed by the exchanger frontend.
 * All routes are under /exchanger/api/ and require the session cookie.
 */

import { Router, Request, Response } from 'express';
import { createHmac } from 'crypto';
import { config } from '../config/env';
import { db } from '../db/client';
import { getAllBalances } from '../ledger/ledgerService';
import { getTradeStats } from '../admin/exchangerService';
import { getTradesByStatus, getTradeLog } from '../engine/tradeService';
import { logger } from '../utils/logger';
import type { Asset } from '../types';

const router = Router();

function ok(res: Response, data: unknown) { res.json({ ok: true, data }); }
function err(res: Response, message: string, status = 400) {
  res.status(status).json({ ok: false, error: message });
}

// ── Profile ────────────────────────────────────────────────────────────────

router.get('/profile', async (req: Request, res: Response) => {
  try {
    const exchangerId = (req.cookies as any)['ex_id'] as string | undefined;
    if (!exchangerId) return err(res, 'Unauthorized', 401);

    const [exchanger, addresses, balances, stats, recentTrades] = await Promise.all([
      db`SELECT * FROM exchangers WHERE id = ${exchangerId}`,
      db`SELECT * FROM deposit_addresses WHERE exchanger_id = ${exchangerId} ORDER BY asset`,
      getAllBalances(exchangerId),
      getTradeStats(exchangerId),
      db`SELECT id, asset, amount, fiat_amount, fiat_currency, status, direction, created_at FROM trades WHERE exchanger_id = ${exchangerId} ORDER BY created_at DESC LIMIT 20`,
    ]);

    if (exchanger.length === 0) return err(res, 'Not found', 404);
    ok(res, {
      exchanger: exchanger[0],
      addresses,
      balances,
      stats,
      recentTrades,
    });
  } catch (e) { err(res, String(e), 500); }
});

// ── Trades ─────────────────────────────────────────────────────────────────

router.get('/trades', async (req: Request, res: Response) => {
  try {
    const exchangerId = (req.cookies as any)['ex_id'] as string | undefined;
    if (!exchangerId) return err(res, 'Unauthorized', 401);

    const status = req.query['status'] as string | undefined;
    const limit = Math.min(parseInt(String(req.query['limit'] ?? '50')), 200);
    const page = Math.max(parseInt(String(req.query['page'] ?? '0')), 0);

    const rows = status
      ? await db`SELECT * FROM trades WHERE exchanger_id = ${exchangerId} AND status = ${status} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${page * limit}`
      : await db`SELECT * FROM trades WHERE exchanger_id = ${exchangerId} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${page * limit}`;

    const [{ total }] = await db<[{ total: string }]>`
      SELECT COUNT(*)::text AS total FROM trades WHERE exchanger_id = ${exchangerId}
      ${status ? db` AND status = ${status}` : db``}
    `;

    ok(res, { trades: rows, total, page, limit });
  } catch (e) { err(res, String(e), 500); }
});

router.get('/trades/:id', async (req: Request, res: Response) => {
  try {
    const exchangerId = (req.cookies as any)['ex_id'] as string | undefined;
    if (!exchangerId) return err(res, 'Unauthorized', 401);

    const [trade] = await db`SELECT * FROM trades WHERE id = ${req.params['id']} AND exchanger_id = ${exchangerId}`;
    if (!trade) return err(res, 'Not found', 404);

    const logs = await db`SELECT * FROM trade_logs WHERE trade_id = ${req.params['id']} ORDER BY created_at ASC`;
    ok(res, { trade, logs });
  } catch (e) { err(res, String(e), 500); }
});

// ── Ledger ─────────────────────────────────────────────────────────────────

router.get('/ledger', async (req: Request, res: Response) => {
  try {
    const exchangerId = (req.cookies as any)['ex_id'] as string | undefined;
    if (!exchangerId) return err(res, 'Unauthorized', 401);

    const limit = Math.min(parseInt(String(req.query['limit'] ?? '100')), 500);
    const page = Math.max(parseInt(String(req.query['page'] ?? '0')), 0);
    const asset = req.query['asset'] as string | undefined;

    const rows = await db`
      SELECT le.*, e.discord_username
      FROM ledger_entries le
      JOIN exchangers e ON e.id = le.exchanger_id
      WHERE le.exchanger_id = ${exchangerId}
        ${asset ? db` AND le.asset = ${asset}` : db``}
      ORDER BY le.created_at DESC
      LIMIT ${limit} OFFSET ${page * limit}
    `;

    ok(res, { entries: rows, page, limit });
  } catch (e) { err(res, String(e), 500); }
});

// ── Withdrawals ────────────────────────────────────────────────────────────

router.get('/withdrawals', async (req: Request, res: Response) => {
  try {
    const exchangerId = (req.cookies as any)['ex_id'] as string | undefined;
    if (!exchangerId) return err(res, 'Unauthorized', 401);

    const rows = await db`
      SELECT w.*, t.user_discord_id, t.status AS trade_status
      FROM withdrawals w
      JOIN trades t ON t.id = w.trade_id
      WHERE w.exchanger_id = ${exchangerId}
      ORDER BY w.created_at DESC LIMIT 200
    `;
    ok(res, rows);
  } catch (e) { err(res, String(e), 500); }
});

// ── Deposit Addresses ──────────────────────────────────────────────────────

router.get('/addresses', async (req: Request, res: Response) => {
  try {
    const exchangerId = (req.cookies as any)['ex_id'] as string | undefined;
    if (!exchangerId) return err(res, 'Unauthorized', 401);

    const rows = await db`
      SELECT da.*, e.discord_username
      FROM deposit_addresses da
      JOIN exchangers e ON e.id = da.exchanger_id
      WHERE da.exchanger_id = ${exchangerId}
      ORDER BY da.asset
    `;
    ok(res, rows);
  } catch (e) { err(res, String(e), 500); }
});

// ── Terms & Conditions ─────────────────────────────────────────────────────

router.get('/terms', async (req: Request, res: Response) => {
  try {
    const exchangerId = (req.cookies as any)['ex_id'] as string | undefined;
    if (!exchangerId) return err(res, 'Unauthorized', 401);

    const [row] = await db<{ terms_and_conditions: string }[]>`
      SELECT terms_and_conditions AS terms FROM exchangers WHERE id = ${exchangerId} LIMIT 1
    `;
    ok(res, { terms: row?.terms_and_conditions ?? '' });
  } catch (e) { err(res, String(e), 500); }
});

router.post('/terms', async (req: Request, res: Response) => {
  try {
    const exchangerId = (req.cookies as any)['ex_id'] as string | undefined;
    if (!exchangerId) return err(res, 'Unauthorized', 401);

    const { terms } = req.body as { terms?: string };
    if (!terms || typeof terms !== 'string') return err(res, 'terms required');

    await db`
      UPDATE exchangers SET terms_and_conditions = ${terms}, updated_at = NOW()
      WHERE id = ${exchangerId}
    `;
    ok(res, { ok: true });
  } catch (e) { err(res, String(e), 500); }
});

// ── Change Password ────────────────────────────────────────────────────────

router.post('/settings/password', async (req: Request, res: Response) => {
  try {
    const exchangerId = (req.cookies as any)['ex_id'] as string | undefined;
    if (!exchangerId) return err(res, 'Unauthorized', 401);

    const { password } = req.body as { password?: string };
    if (!password || password.length < 8) return err(res, 'Password must be at least 8 characters');

    const hash = createHmac('sha256', config.DASHBOARD_SECRET).update(password).digest('hex');
    await db`
      UPDATE exchangers SET dashboard_password_hash = ${hash}, updated_at = NOW()
      WHERE id = ${exchangerId}
    `;
    ok(res, { ok: true });
  } catch (e) { err(res, String(e), 500); }
});

export default router;
