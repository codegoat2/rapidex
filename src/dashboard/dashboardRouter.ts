/**
 * Dashboard Router
 *
 * Mounts:
 *   GET  /dashboard           → login page (if not authed) or redirect to /dashboard/
 *   POST /dashboard/login     → set session cookie
 *   GET  /dashboard/logout    → clear session
 *   GET  /dashboard/*         → serve SPA shell (protected)
 *   /dashboard/api/*          → JSON API (protected)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config/env';
import apiRouter from './apiRouter';
import { renderShell } from './shell';

const router = Router();

// ── Session via signed cookie ───────────────────────────────────────────────

const SESSION_COOKIE = 'rdx_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function signToken(ts: number): string {
  return createHmac('sha256', config.DASHBOARD_SECRET).update(String(ts)).digest('hex');
}

function setSessionCookie(res: Response): void {
  const ts    = Date.now();
  const token = `${ts}.${signToken(ts)}`;
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   SESSION_TTL_MS,
  });
}

function isAuthenticated(req: Request): boolean {
  const raw = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!raw) return false;
  const [tsStr, sig] = raw.split('.');
  if (!tsStr || !sig) return false;
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts) || Date.now() - ts > SESSION_TTL_MS) return false;
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(signToken(ts)));
  } catch {
    return false;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isAuthenticated(req)) return next();
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  res.redirect('/dashboard/login');
}

// ── Login / Logout ──────────────────────────────────────────────────────────

router.get('/login', (_req: Request, res: Response) => {
  res.send(renderLoginPage());
});

router.post('/login', (req: Request, res: Response) => {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (record && record.resetAt > now && record.count >= LOGIN_MAX_ATTEMPTS) {
    res.status(429).send(renderLoginPage('Too many attempts. Try again later.'));
    return;
  }

  const { password } = req.body as { password?: string };
  try {
    const matches = timingSafeEqual(
      Buffer.from(password ?? ''),
      Buffer.from(config.DASHBOARD_SECRET),
    );
    if (!matches) {
      loginAttempts.set(key, record && record.resetAt > now
        ? { count: record.count + 1, resetAt: record.resetAt }
        : { count: 1, resetAt: now + LOGIN_WINDOW_MS });
      res.send(renderLoginPage('Invalid password'));
      return;
    }
  } catch {
    loginAttempts.set(key, record && record.resetAt > now
      ? { count: record.count + 1, resetAt: record.resetAt }
      : { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    res.send(renderLoginPage('Invalid password'));
    return;
  }
  loginAttempts.delete(key);
  setSessionCookie(res);
  res.redirect('/dashboard/');
});

router.get('/logout', (_req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE);
  res.redirect('/dashboard/login');
});

// ── Protected API ───────────────────────────────────────────────────────────

router.use('/api', requireAuth, apiRouter);

// ── SPA Shell (all other protected routes) ──────────────────────────────────

router.get('/', requireAuth, (_req: Request, res: Response) => {
  res.send(renderShell());
});

router.get('/*', requireAuth, (_req: Request, res: Response) => {
  res.send(renderShell());
});

// ── Login page HTML ─────────────────────────────────────────────────────────

function renderLoginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>RapidEx — Admin Login</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
         background:#0f1117;font-family:'Inter',system-ui,sans-serif;color:#e2e8f0}
    .card{background:#1a1d2e;border:1px solid #2d3154;border-radius:16px;padding:40px;
          width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
    .logo{text-align:center;margin-bottom:32px}
    .logo h1{font-size:28px;font-weight:700;background:linear-gradient(135deg,#6366f1,#8b5cf6);
             -webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .logo p{color:#64748b;font-size:13px;margin-top:4px}
    label{display:block;font-size:13px;color:#94a3b8;margin-bottom:6px;font-weight:500}
    input{width:100%;padding:12px 16px;background:#0f1117;border:1px solid #2d3154;
          border-radius:8px;color:#e2e8f0;font-size:15px;outline:none;transition:.2s}
    input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
    .btn{width:100%;padding:13px;background:linear-gradient(135deg,#6366f1,#8b5cf6);
         border:none;border-radius:8px;color:#fff;font-size:15px;font-weight:600;
         cursor:pointer;margin-top:20px;transition:.2s}
    .btn:hover{opacity:.9;transform:translateY(-1px)}
    .error{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);
           color:#fca5a5;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>⚡ RapidEx</h1>
      <p>Admin Dashboard</p>
    </div>
    ${error ? `<div class="error">⚠ ${error}</div>` : ''}
    <form method="POST" action="/dashboard/login">
      <label>Password</label>
      <input type="password" name="password" placeholder="Enter dashboard password" autofocus required>
      <button class="btn" type="submit">Sign In</button>
    </form>
    <div style="margin-top:20px;text-align:center;font-size:12px;color:#64748b">
      <a href="/" style="color:#6366f1;margin:0 8px">Home</a> ·
      <a href="/about" style="color:#6366f1;margin:0 8px">About</a> ·
      <a href="/how-to-start" style="color:#6366f1;margin:0 8px">How to Start</a> ·
      <a href="/become-exchanger" style="color:#6366f1;margin:0 8px">Become Exchanger</a> ·
      <a href="/terms" style="color:#6366f1;margin:0 8px">Terms</a>
    </div>
  </div>
</body>
</html>`;
}

export default router;
