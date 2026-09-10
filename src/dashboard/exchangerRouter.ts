/**
 * Exchanger Dashboard Router
 *
 * Mounts:
 *   GET  /exchanger           → login page (if not authed) or redirect to /exchanger/
 *   POST /exchanger/login     → set session cookie
 *   GET  /exchanger/logout    → clear session
 *   GET  /exchanger/*         → serve SPA shell (protected)
 *   /exchanger/api/*          → JSON API (protected)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config/env';
import { db } from '../db/client';
import apiRouter from './exchangerApiRouter';
import { renderExchangerShell } from './exchangerShell';

const router = Router();

const SESSION_COOKIE = 'ex_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function signToken(ts: number): string {
  return createHmac('sha256', config.DASHBOARD_SECRET).update(String(ts)).digest('hex');
}

function setSessionCookie(res: Response): void {
  const ts = Date.now();
  const token = `${ts}.${signToken(ts)}`;
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
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
  res.redirect('/exchanger/login');
}

router.get('/login', (_req: Request, res: Response) => {
  res.send(renderExchangerLoginPage());
});

router.post('/login', async (req: Request, res: Response) => {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (record && record.resetAt > now && record.count >= LOGIN_MAX_ATTEMPTS) {
    res.status(429).send(renderExchangerLoginPage('Too many attempts. Try again later.'));
    return;
  }

  const { username, password } = req.body as { username?: string; password?: string };
  try {
    const [exchanger] = await db<{ id: string; discord_username: string; dashboard_password_hash: string }[]>`
      SELECT id, discord_username, dashboard_password_hash
      FROM exchangers
      WHERE LOWER(discord_username) = LOWER(${username ?? ''})
      LIMIT 1
    `;

    if (!exchanger || !exchanger.dashboard_password_hash) {
      loginAttempts.set(key, record && record.resetAt > now
        ? { count: record.count + 1, resetAt: record.resetAt }
        : { count: 1, resetAt: now + LOGIN_WINDOW_MS });
      res.send(renderExchangerLoginPage('Invalid username or password'));
      return;
    }

    const passwordHash = createHmac('sha256', config.DASHBOARD_SECRET).update(password ?? '').digest('hex');
    const matches = timingSafeEqual(
      Buffer.from(passwordHash),
      Buffer.from(exchanger.dashboard_password_hash),
    );

    if (!matches) {
      loginAttempts.set(key, record && record.resetAt > now
        ? { count: record.count + 1, resetAt: record.resetAt }
        : { count: 1, resetAt: now + LOGIN_WINDOW_MS });
      res.send(renderExchangerLoginPage('Invalid username or password'));
      return;
    }

    loginAttempts.delete(key);
    res.cookie('ex_id', exchanger.id, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_TTL_MS,
    });
    setSessionCookie(res);
    res.redirect('/exchanger/');
  } catch {
    loginAttempts.set(key, record && record.resetAt > now
      ? { count: record.count + 1, resetAt: record.resetAt }
      : { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    res.send(renderExchangerLoginPage('Invalid username or password'));
  }
});

router.get('/logout', (_req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE);
  res.clearCookie('ex_id');
  res.redirect('/exchanger/login');
});

router.use('/api', requireAuth, apiRouter);
router.get('/', requireAuth, (_req: Request, res: Response) => {
  res.send(renderExchangerShell());
});
router.get('/*', requireAuth, (_req: Request, res: Response) => {
  res.send(renderExchangerShell());
});

function renderExchangerLoginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>RapidEx — Exchanger Login</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
         background:#0a0a0f;font-family:'Inter',system-ui,sans-serif;color:#e2e8f0}
    .card{background:#13131f;border:1px solid #2a2a3a;border-radius:20px;padding:48px;
           width:100%;max-width:420px;box-shadow:0 24px 80px rgba(0,0,0,.6)}
    .logo{text-align:center;margin-bottom:40px}
    .logo h1{font-size:32px;font-weight:800;background:linear-gradient(135deg,#6366f1,#a855f7);
             -webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-.02em}
    .logo p{color:#64748b;font-size:14px;margin-top:6px;font-weight:500}
    label{display:block;font-size:13px;color:#94a3b8;margin-bottom:8px;font-weight:600;letter-spacing:.02em}
    input{width:100%;padding:14px 18px;background:#0a0a0f;border:1px solid #2a2a3a;
          border-radius:12px;color:#e2e8f0;font-size:15px;outline:none;transition:.2s}
    input:focus{border-color:#6366f1;box-shadow:0 0 0 4px rgba(99,102,241,.12)}
    .btn{width:100%;padding:15px;background:linear-gradient(135deg,#6366f1,#a855f7);
         border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;
         cursor:pointer;margin-top:24px;transition:.2s;letter-spacing:.01em}
    .btn:hover{opacity:.9;transform:translateY(-1px)}
    .error{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);
           color:#fca5a5;padding:14px 18px;border-radius:12px;font-size:13px;margin-bottom:20px;
           font-weight:500}
    .footer{text-align:center;margin-top:24px;font-size:12px;color:#64748b}
    .footer a{color:#6366f1;text-decoration:none;font-weight:600}
    .footer a:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>RapidEx</h1>
      <p>Exchanger Portal</p>
    </div>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/exchanger/login">
      <label>Username</label>
      <input type="text" name="username" placeholder="Your Discord username" autocomplete="username" required>
      <label style="margin-top:16px">Password</label>
      <input type="password" name="password" placeholder="Your dashboard password" autocomplete="current-password" required>
      <button class="btn" type="submit">Sign In</button>
    </form>
    <div class="footer">
      Need help? <a href="https://discord.gg/v9EuzwQB5w" target="_blank">Join our Discord</a>
    </div>
  </div>
</body>
</html>`;
}

export default router;
