# RapidEx — Supabase + Railway Deployment Guide

## Overview

```
GitHub → push to main → GitHub Actions (lint + build) → Railway (Docker deploy)
                                                               ↕
                                                        Supabase (PostgreSQL)
```

---

## 1. Supabase Setup

### 1.1 Create project
1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a region close to your Railway deployment region
3. Note your **project ref** (in the URL: `app.supabase.com/project/<ref>`)

### 1.2 Get connection strings
**Project Settings → Database → Connection string**

- **Direct (URI format, port 5432)** → set as `DATABASE_URL`
  ```
  postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
  ```

- **Transaction pooler (port 6543)** → set as `DATABASE_POOL_URL`
  ```
  postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
  ```

> The bot uses `DATABASE_URL` (direct) for its main pool on Railway since it's a persistent
> process. `DATABASE_POOL_URL` is optional — only needed if you add serverless functions later.

### 1.3 Run migrations

**Option A — from your local machine:**
```bash
# Copy .env.example to .env and fill DATABASE_URL
cp .env.example .env
npm run migrate
```

**Option B — Railway one-off command (after deploy):**
```bash
railway run npm run migrate
```

### 1.4 Enable Row Level Security (recommended)
In Supabase SQL Editor, run for each sensitive table:
```sql
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;
-- The bot connects as the postgres user (service role) so it bypasses RLS.
-- RLS protects against accidental direct DB access via Supabase client libs.
```

---

## 2. Railway Setup

### 2.1 Create project
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select the `RapidEx` repository
3. Railway auto-detects the `Dockerfile`

### 2.2 Set environment variables
In Railway → your service → Variables, add **all** values from `.env.example`:

**Critical (required before first deploy):**
```
DISCORD_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
ROLE_ADMIN
ROLE_EXCHANGER
CHANNEL_ADMIN_ALERTS
CHANNEL_ANNOUNCEMENTS
DATABASE_URL                  ← Supabase direct connection
ENCRYPTION_KEY                ← 64-char hex: openssl rand -hex 32
MASTER_WALLET_MNEMONIC        ← Your BIP39 mnemonic (24 words)
BLOCKCYPHER_TOKEN
BLOCKCYPHER_WEBHOOK_SECRET
ALCHEMY_API_KEY
ALCHEMY_WEBHOOK_AUTH_TOKEN
HELIUS_API_KEY
HELIUS_WEBHOOK_SECRET
NETWORK                       ← testnet or mainnet
WEBHOOK_BASE_URL              ← https://<your-railway-domain>
NODE_ENV                      ← production
```

**Optional but recommended:**
```
DATABASE_POOL_URL             ← Supabase pooler connection
SENTRY_DSN
HOT_WALLET_BTC
HOT_WALLET_LTC
HOT_WALLET_ETH
HOT_WALLET_SOL
```

### 2.3 Configure public domain
Railway → your service → Settings → Networking:
- Enable **Public Networking**
- The generated domain (e.g. `rapidex-production.up.railway.app`) is your `WEBHOOK_BASE_URL`

### 2.4 Port
Railway reads the `PORT` environment variable automatically. The webhook server
listens on `WEBHOOK_PORT` (default 3000). Set in Railway Variables:
```
PORT=3000
WEBHOOK_PORT=3000
```

### 2.5 Health check
Railway uses `GET /health` — already configured in `railway.toml`:
```toml
[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
```

---

## 3. GitHub Actions CI/CD

### 3.1 Add Railway token secret
1. Railway → Account Settings → Tokens → Create token
2. GitHub repo → Settings → Secrets → Actions → New secret:
   - Name: `RAILWAY_TOKEN`
   - Value: the token from step 1

### 3.2 Pipeline behaviour
- **Pull Request to main** → runs lint + TypeScript build (no deploy)
- **Push to main** → lint + build + `railway up --detach` (deploy)

---

## 4. Register Discord slash commands

Run once after first deploy (or when commands change):
```bash
# Locally (with .env filled):
npm run build
node dist/bot/register.js

# Or via Railway one-off:
railway run node dist/bot/register.js
```

Or set `REGISTER_COMMANDS=true` in Railway Variables to auto-register on every startup
(fine for development, avoid in production to prevent rate-limit errors).

---

## 5. Register blockchain webhooks

After the bot is deployed and `WEBHOOK_BASE_URL` is set, register webhooks with each provider:

**BlockCypher (BTC / LTC):**
```bash
# BTC
curl -X POST "https://api.blockcypher.com/v1/btc/main/hooks?token=YOUR_TOKEN" \
  -d '{"event":"unconfirmed-tx","url":"https://your-domain/webhooks/blockcypher"}'

# LTC
curl -X POST "https://api.blockcypher.com/v1/ltc/main/hooks?token=YOUR_TOKEN" \
  -d '{"event":"unconfirmed-tx","url":"https://your-domain/webhooks/blockcypher"}'
```

**Alchemy:** Dashboard → Webhooks → Address Activity → add your exchanger addresses
→ URL: `https://your-domain/webhooks/alchemy`

**Helius:** Dashboard → Webhooks → Create → Transaction type: TOKEN_TRANSFER
→ URL: `https://your-domain/webhooks/helius`

---

## 6. First-run checklist

- [ ] Supabase project created, connection strings copied
- [ ] `npm run migrate` run successfully (all 11 tables created)
- [ ] Railway project created, all env vars set
- [ ] `WEBHOOK_BASE_URL` set to your Railway domain
- [ ] `RAILWAY_TOKEN` secret added to GitHub
- [ ] Push to `main` → CI passes → Railway deploys
- [ ] `/health` endpoint returns `{"status":"ok"}` or `{"status":"healthy"}`
- [ ] Discord slash commands registered
- [ ] Blockchain webhooks registered with providers
- [ ] `/setup-panel` run in your Discord server to deploy the trade panel
- [ ] Test trade on testnet end-to-end

---

## 7. Supabase backups

Supabase Pro tier includes daily automated backups.
On the free tier, schedule manual backups with:
```bash
# Point-in-time export via pg_dump (run from local with DATABASE_URL set)
pg_dump "$DATABASE_URL" --format=custom --file="rapidex-backup-$(date +%Y%m%d).dump"
```

---

## 8. Monitoring

- **Railway Logs** — real-time stdout/stderr (Winston JSON logs in production)
- **Sentry** — set `SENTRY_DSN` for error tracking
- **Admin Discord channel** — all alerts and daily reports post here automatically
- **`/health` endpoint** — `GET https://your-domain/health` returns system status JSON
