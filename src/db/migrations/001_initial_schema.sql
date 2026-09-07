-- ============================================================
-- RapidEx — Migration 001: Initial Schema
-- Production-grade schema with double-entry ledger.
--
-- Conventions:
--   • All IDs are UUIDs (gen_random_uuid())
--   • All monetary amounts stored as NUMERIC(36,18) — no floats
--   • All timestamps are TIMESTAMPTZ (UTC)
--   • All enum-like columns use CHECK constraints
--   • Every table has created_at; mutable tables have updated_at
-- ============================================================

BEGIN;

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- query perf (optional but useful)

-- ============================================================
-- USERS
-- Represents any Discord user who has interacted with the bot.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id        TEXT        NOT NULL UNIQUE,
  discord_username  TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users (discord_id);

-- ============================================================
-- EXCHANGERS
-- Verified service providers who fulfill trades.
-- ============================================================
CREATE TABLE IF NOT EXISTS exchangers (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  discord_id              TEXT        NOT NULL UNIQUE,
  discord_username        TEXT        NOT NULL,
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
  is_banned               BOOLEAN     NOT NULL DEFAULT FALSE,
  ban_reason              TEXT,
  verified_by_discord_id  TEXT        NOT NULL,
  verified_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchangers_discord_id ON exchangers (discord_id);
CREATE INDEX IF NOT EXISTS idx_exchangers_is_active ON exchangers (is_active) WHERE is_active = TRUE;

-- ============================================================
-- DEPOSIT ADDRESSES
-- Per-exchanger HD-derived deposit addresses per chain.
-- Private keys are NEVER stored here — only derivation paths.
-- ============================================================
CREATE TABLE IF NOT EXISTS deposit_addresses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exchanger_id    UUID        NOT NULL REFERENCES exchangers(id) ON DELETE RESTRICT,
  asset           TEXT        NOT NULL CHECK (asset IN (
                    'BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL'
                  )),
  chain           TEXT        NOT NULL CHECK (chain IN (
                    'bitcoin', 'litecoin', 'ethereum', 'solana'
                  )),
  address         TEXT        NOT NULL,
  derivation_path TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (exchanger_id, asset)
);

CREATE INDEX IF NOT EXISTS idx_deposit_addresses_exchanger_id ON deposit_addresses (exchanger_id);
CREATE INDEX IF NOT EXISTS idx_deposit_addresses_address ON deposit_addresses (address);

-- ============================================================
-- TRADES
-- Core entity. Every field is a source of truth for one aspect
-- of the trade. Status column is the state machine gate.
-- ============================================================
CREATE TABLE IF NOT EXISTS trades (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_discord_id     TEXT        NOT NULL,
  exchanger_id        UUID        REFERENCES exchangers(id) ON DELETE RESTRICT,
  asset               TEXT        NOT NULL CHECK (asset IN (
                        'BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL'
                      )),
  amount              NUMERIC(36,18) NOT NULL CHECK (amount > 0),
  fiat_currency       TEXT        NOT NULL CHECK (fiat_currency IN ('EUR', 'USD', 'GBP')),
  fiat_method         TEXT        NOT NULL CHECK (fiat_method IN (
                        'BANK_TRANSFER', 'REVOLUT', 'WISE', 'PAYPAL', 'CASH_IN_PERSON', 'OTHER'
                      )),
  direction           TEXT        NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  status              TEXT        NOT NULL DEFAULT 'OPEN' CHECK (status IN (
                        'OPEN', 'CLAIMED', 'FIAT_PENDING', 'FIAT_SENT',
                        'RELEASE_PENDING', 'CRYPTO_SENT', 'COMPLETED',
                        'CANCELLED', 'DISPUTED', 'EXPIRED', 'FAILED'
                      )),
  ticket_channel_id   TEXT        NOT NULL,
  user_wallet_address TEXT,
  tx_id               TEXT,
  claimed_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_user_discord_id ON trades (user_discord_id);
CREATE INDEX IF NOT EXISTS idx_trades_exchanger_id ON trades (exchanger_id) WHERE exchanger_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades (status);
CREATE INDEX IF NOT EXISTS idx_trades_status_open ON trades (status) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_trades_expires_at ON trades (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades (created_at DESC);

-- ============================================================
-- TRADE LOGS
-- Immutable audit trail of every state transition.
-- One row per transition — never updated, only inserted.
-- ============================================================
CREATE TABLE IF NOT EXISTS trade_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id         UUID        NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  from_status      TEXT        CHECK (from_status IN (
                     'OPEN', 'CLAIMED', 'FIAT_PENDING', 'FIAT_SENT',
                     'RELEASE_PENDING', 'CRYPTO_SENT', 'COMPLETED',
                     'CANCELLED', 'DISPUTED', 'EXPIRED', 'FAILED'
                   )),
  to_status        TEXT        NOT NULL CHECK (to_status IN (
                     'OPEN', 'CLAIMED', 'FIAT_PENDING', 'FIAT_SENT',
                     'RELEASE_PENDING', 'CRYPTO_SENT', 'COMPLETED',
                     'CANCELLED', 'DISPUTED', 'EXPIRED', 'FAILED'
                   )),
  actor_discord_id TEXT        NOT NULL,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_logs_trade_id ON trade_logs (trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_created_at ON trade_logs (created_at DESC);

-- ============================================================
-- LEDGER ENTRIES
-- Double-entry financial ledger. Every unit of crypto is
-- accounted for. No balance is computed anywhere except by
-- summing this table (via the ledger service).
--
-- amount is ALWAYS positive. Direction is determined by type:
--   Credits (increase available):  DEPOSIT, ESCROW_RELEASE, MANUAL_CREDIT
--   Debits  (decrease available):  ESCROW_LOCK, WITHDRAWAL, FEE, MANUAL_DEBIT
--
-- Escrow balance is separately tracked:
--   ESCROW_LOCK    → available ↓, escrow ↑
--   ESCROW_RELEASE → available ↑, escrow ↓
--   WITHDRAWAL     → escrow ↓ (funds leave the system)
-- ============================================================
CREATE TABLE IF NOT EXISTS ledger_entries (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  exchanger_id     UUID           NOT NULL REFERENCES exchangers(id) ON DELETE RESTRICT,
  trade_id         UUID           REFERENCES trades(id) ON DELETE RESTRICT,
  type             TEXT           NOT NULL CHECK (type IN (
                     'DEPOSIT', 'ESCROW_LOCK', 'ESCROW_RELEASE',
                     'WITHDRAWAL', 'FEE', 'MANUAL_CREDIT', 'MANUAL_DEBIT'
                   )),
  asset            TEXT           NOT NULL CHECK (asset IN (
                     'BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL'
                   )),
  amount           NUMERIC(36,18) NOT NULL CHECK (amount > 0),
  balance_before   NUMERIC(36,18) NOT NULL CHECK (balance_before >= 0),
  balance_after    NUMERIC(36,18) NOT NULL CHECK (balance_after >= 0),
  escrow_before    NUMERIC(36,18) NOT NULL CHECK (escrow_before >= 0),
  escrow_after     NUMERIC(36,18) NOT NULL CHECK (escrow_after >= 0),
  reference        TEXT           NOT NULL,
  idempotency_key  TEXT           NOT NULL UNIQUE, -- prevents duplicate ledger entries
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_exchanger_asset ON ledger_entries (exchanger_id, asset);
CREATE INDEX IF NOT EXISTS idx_ledger_trade_id ON ledger_entries (trade_id) WHERE trade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger_entries (type);

-- ============================================================
-- AUDIT LOGS
-- Immutable record of every admin and system action.
-- Never updated; only inserted.
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_discord_id  TEXT        NOT NULL,
  target_discord_id TEXT,
  action            TEXT        NOT NULL CHECK (action IN (
                      'EXCHANGER_VERIFIED', 'EXCHANGER_BANNED',
                      'MANUAL_CREDIT', 'MANUAL_DEBIT',
                      'FORCE_RELEASE', 'FORCE_CANCEL',
                      'FEE_CONFIG_UPDATED', 'TRADE_DISPUTED',
                      'DISPUTE_RESOLVED', 'PANEL_DEPLOYED',
                      'WEBHOOK_REGISTERED', 'SYSTEM_ACTION'
                    )),
  entity_type       TEXT,   -- e.g. 'trade', 'exchanger'
  entity_id         TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_discord_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs (target_discord_id) WHERE target_discord_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- ============================================================
-- WEBHOOK EVENTS
-- Idempotency store for blockchain webhook events.
-- Every incoming webhook is recorded here first.
-- If the event_id already exists, the webhook is a duplicate
-- and must be ignored.
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      TEXT        NOT NULL CHECK (provider IN (
                  'BLOCKCYPHER', 'ALCHEMY', 'HELIUS', 'RECONCILIATION'
                )),
  event_id      TEXT        NOT NULL,          -- provider-supplied unique ID
  raw_payload   JSONB       NOT NULL,
  processed     BOOLEAN     NOT NULL DEFAULT FALSE,
  processed_at  TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (provider, event_id)               -- composite uniqueness per provider
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_event ON webhook_events (provider, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events (processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events (created_at DESC);

-- ============================================================
-- HOT WALLET BALANCES
-- Cached on-chain balances for the exchange's hot wallets.
-- Updated by the monitoring worker; used for threshold alerts.
-- ============================================================
CREATE TABLE IF NOT EXISTS hot_wallet_balances (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  asset            TEXT           NOT NULL CHECK (asset IN (
                     'BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL'
                   )),
  chain            TEXT           NOT NULL CHECK (chain IN (
                     'bitcoin', 'litecoin', 'ethereum', 'solana'
                   )),
  address          TEXT           NOT NULL,
  balance          NUMERIC(36,18) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  last_checked_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  UNIQUE (asset)
);

-- ============================================================
-- FEE CONFIG
-- Per-asset fee configuration. Managed by admins via /set-fee.
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_config (
  id                      UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  asset                   TEXT           NOT NULL UNIQUE CHECK (asset IN (
                            'BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL'
                          )),
  fee_percentage          NUMERIC(5,4)   NOT NULL DEFAULT 0.5 CHECK (fee_percentage >= 0 AND fee_percentage <= 100),
  min_fee_amount          NUMERIC(36,18) NOT NULL DEFAULT 0 CHECK (min_fee_amount >= 0),
  updated_by_discord_id   TEXT           NOT NULL,
  updated_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- Automatically update the updated_at column on row updates.
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users', 'exchangers', 'trades', 'hot_wallet_balances', 'fee_config'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I;
       CREATE TRIGGER set_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- ============================================================
-- SEED: Default fee config
-- Insert default fee rows for all supported assets.
-- ON CONFLICT DO NOTHING so re-running migration is safe.
-- ============================================================
INSERT INTO fee_config (asset, fee_percentage, min_fee_amount, updated_by_discord_id)
VALUES
  ('BTC',       0.5, 0.000010, 'SYSTEM'),
  ('LTC',       0.5, 0.001,    'SYSTEM'),
  ('ETH',       0.5, 0.0005,   'SYSTEM'),
  ('USDT_ERC20',0.5, 1.0,      'SYSTEM'),
  ('USDC_ERC20',0.5, 1.0,      'SYSTEM'),
  ('USDC_SPL',  0.5, 0.5,      'SYSTEM')
ON CONFLICT (asset) DO NOTHING;

-- ============================================================
-- SCHEMA VERSION TRACKING
-- Simple table to record which migrations have been applied.
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('001_initial_schema')
ON CONFLICT (version) DO NOTHING;

COMMIT;
