-- Migration 015: fee profit split and admin profit balance

BEGIN;

-- Fee percentages are percentages, not fractions, and may exceed 100.
ALTER TABLE fee_config ALTER COLUMN fee_percentage TYPE NUMERIC(12,4);
ALTER TABLE fee_config DROP CONSTRAINT IF EXISTS fee_config_fee_percentage_check;
ALTER TABLE fee_config ADD CONSTRAINT fee_config_fee_percentage_check
  CHECK (fee_percentage >= 0 AND fee_percentage <= 10000);

ALTER TABLE trade_quotes ALTER COLUMN fee_percentage TYPE NUMERIC(12,4);
ALTER TABLE trade_quotes DROP CONSTRAINT IF EXISTS trade_quotes_fee_percentage_check;
ALTER TABLE trade_quotes ADD CONSTRAINT trade_quotes_fee_percentage_check
  CHECK (fee_percentage >= 0 AND fee_percentage <= 10000);

-- One immutable accounting stream for the platform's 50% profit share.
CREATE TABLE IF NOT EXISTS admin_profit_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id          UUID REFERENCES trades(id) ON DELETE RESTRICT,
  asset             TEXT NOT NULL CHECK (asset IN ('BTC','LTC','ETH','SOL','BNB','USDT_BEP20')),
  type              TEXT NOT NULL CHECK (type IN ('PROFIT_CREDIT','WITHDRAWAL','WITHDRAWAL_REFUND','MANUAL_ADJUSTMENT')),
  amount            NUMERIC(36,18) NOT NULL CHECK (amount > 0),
  balance_before    NUMERIC(36,18) NOT NULL CHECK (balance_before >= 0),
  balance_after     NUMERIC(36,18) NOT NULL CHECK (balance_after >= 0),
  reference         TEXT NOT NULL,
  idempotency_key   TEXT NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_profit_trade
  ON admin_profit_entries (trade_id) WHERE type = 'PROFIT_CREDIT';
CREATE INDEX IF NOT EXISTS idx_admin_profit_asset_created
  ON admin_profit_entries (asset, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_withdrawals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset               TEXT NOT NULL CHECK (asset IN ('BTC','LTC','ETH','SOL','BNB','USDT_BEP20')),
  amount              NUMERIC(36,18) NOT NULL CHECK (amount > 0),
  destination         TEXT NOT NULL,
  source_exchanger_id UUID NOT NULL REFERENCES exchangers(id) ON DELETE RESTRICT,
  status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','BROADCAST','CONFIRMED','FAILED')),
  tx_id               TEXT,
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_withdrawals_pending
  ON admin_withdrawals (status, next_attempt_at);

INSERT INTO bot_settings (key, value, description, category)
VALUES
  ('ADMIN_EXCHANGER_ID', '', 'Verified exchanger hot-wallet source used for admin profit withdrawals', 'admin')
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('015_profit_split_and_admin_balance')
ON CONFLICT (version) DO NOTHING;

COMMIT;
