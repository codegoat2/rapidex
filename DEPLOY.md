- Ticket category ID (TICKET_CATEGORY_ID)
# RapidEx — Supabase + Railway Deployment Guide

## Architecture

```
velxoai.xyz (Railway — single service)
  ├── /dashboard/*     → Admin dashboard (password protected)
  ├── /dashboard/api/* → REST API consumed by dashboard
  ├── /webhooks/nownodes → NOWNodes deposit callbacks
  └── /health          → Railway health probe

Supabase PostgreSQL
  └── All data, ledger, settings, audit logs

Discord Bot
  └── Runs in same process alongside the HTTP server
```

---

## 1. Supabase Setup

### 1.1 Create project
1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a region close to your Railway deployment region
3. Note your **project ref** (visible in the URL)

### 1.2 Get connection strings
**Project Settings → Database → Connection string**

- **Direct (port 5432)** → `DATABASE_URL`
  ```
  postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
  ```

- **Pooler (port 6543, optional)** → `DATABASE_POOL_URL`
  ```
  postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
  ```

### 1.3 Run migrations
```bash
# Locally with .env filled:
cp .env.example .env
# fill DATABASE_URL
npm run migrate
# Runs all pending migrations, including quotes, limits, and ticket settings
```

Or via Railway one-off after first deploy:
```bash
railway run npm run migrate
```

`railway run` injects Railway variables into a command running locally. If using
the Railway service shell instead, run `node dist/db/migrate.js` there.

---

## 2. Railway Setup

### 2.1 Create project
Railway → New Project → Deploy from GitHub → select `codegoat2/rapidex`

Railway auto-detects the `Dockerfile`.

### 2.2 Custom domain
Railway → your service → Settings → Networking:
- Add custom domain: `velxoai.xyz`
- Also add `www.velxoai.xyz` if desired
- Copy the Railway-provided CNAME and add it to your DNS at your domain registrar

### 2.3 Environment variables
Railway → your service → Variables → add all values from `.env.example`:

**Required before first deploy:**
```
DISCORD_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
ROLE_ADMIN
ROLE_EXCHANGER
CHANNEL_ADMIN_ALERTS
CHANNEL_ANNOUNCEMENTS
DATABASE_URL                ← Supabase direct (port 5432)
ENCRYPTION_KEY              ← openssl rand -hex 32
MASTER_WALLET_MNEMONIC      ← 24-word BIP39 mnemonic
NOWNODES_API_KEY            ← from account.nownodes.io
DASHBOARD_SECRET            ← openssl rand -hex 24  (dashboard login password)
WEBHOOK_SECRET              ← openssl rand -hex 32  (NOWNodes HMAC secret)
WEBHOOK_BASE_URL            ← https://velxoai.xyz
NODE_ENV                    ← production
NETWORK                     ← testnet or mainnet
```

**Set automatically by Railway (do not set manually):**
```
PORT   ← Railway injects this; the app reads it as WEBHOOK_PORT
```

Add to Railway Variables:
```
WEBHOOK_PORT=${{PORT}}
```

### 2.4 Health check
Already configured in `railway.toml`:
```toml
[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
```

---

## 3. Admin Dashboard

Once deployed, the dashboard is live at:
```
https://velxoai.xyz/dashboard
```

### Login
Use the value you set for `DASHBOARD_SECRET`.

### Dashboard pages
| Page | What it does |
|---|---|
| **Overview** | Live trade counts, ledger totals, recent activity |
| **Trades** | Browse/filter all trades, view full state history |
| **Exchangers** | List, verify, ban exchangers; view per-exchanger balances |
| **Ledger** | Full double-entry ledger with asset/exchanger filters |
| **Fee Config** | Edit per-asset fee % and minimum fee amounts inline |
| **Hot Wallets** | Cached on-chain balances and alert status |
| **Webhook Events** | All incoming NOWNodes events with processed/error status |
| **Audit Log** | Every admin/system action with metadata |
| **Deposit Addresses** | All derived HD wallet addresses per exchanger |
| **Settings** | Edit ALL runtime settings without redeploy |

### Settings page
Every value that would normally require a redeploy can be changed live:
- Discord role IDs (ROLE_ADMIN, ROLE_EXCHANGER)
- Discord channel IDs (CHANNEL_ADMIN_ALERTS, CHANNEL_ANNOUNCEMENTS)
- Trade timeouts (open, claimed, fiat-sent, dispute escalation)
- Rate limits (ticket creation, command rate)
- Hot wallet alert thresholds per asset
- Network (mainnet/testnet toggle)
- Maintenance mode (stops new trade tickets)
- Bot status message

Changes apply within 60 seconds (settings cache TTL).

---

## 4. GitHub Actions CI/CD

### 4.1 Add Railway token secret
1. Railway → Account Settings → Tokens → Create token
2. GitHub → repo Settings → Secrets → Actions → New secret:
   - Name: `RAILWAY_TOKEN`
   - Value: the token

### 4.2 Pipeline
- **PR to main** → lint + TypeScript build only
- **Push to main** → lint + build + `railway up --detach`

---

## 5. Register slash commands

Run once:
```bash
# Via Railway one-off:
railway run node dist/bot/register.js

# Or locally:
npm run build && node dist/bot/register.js
```

---

## 6. Register NOWNodes webhook

After deploy, in your NOWNodes dashboard:
1. Go to your project → Webhooks
2. Add callback URL:
   ```
   https://velxoai.xyz/webhooks/nownodes
   ```
3. Set the webhook secret to match your `WEBHOOK_SECRET` env var
4. Select address-activity notifications for all your deposit addresses

Or use the NOWNodes API to register programmatically per exchanger deposit address.

---

## 7. First-run checklist

- [ ] Supabase project created
- [ ] `npm run migrate` completed (all tables created including `bot_settings`)
- [ ] Railway project created, all env vars set
- [ ] Custom domain `velxoai.xyz` added in Railway → DNS CNAME configured
- [ ] Push to `main` → CI passes → Railway deploys
- [ ] `GET https://velxoai.xyz/health` returns `{"status":"healthy"}`
- [ ] Dashboard accessible at `https://velxoai.xyz/dashboard`
- [ ] Discord slash commands registered
- [ ] NOWNodes webhook registered with callback URL
- [ ] `/setup-panel` run in Discord server to deploy the trade panel
- [ ] Settings page — fill in Discord role/channel IDs
- [ ] End-to-end test trade on testnet
