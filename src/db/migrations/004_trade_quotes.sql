-- ============================================================
-- Migration 004: durable trade quotes
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS trade_quotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_discord_id TEXT NOT NULL,
  asset           TEXT NOT NULL CHECK (asset IN ('BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL')),
  amount          NUMERIC(36,18) NOT NULL CHECK (amount > 0),
  direction       TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  fiat_currency   TEXT NOT NULL CHECK (fiat_currency IN ('EUR', 'USD', 'GBP')),
  fiat_method     TEXT NOT NULL CHECK (fiat_method IN ('BANK_TRANSFER', 'REVOLUT', 'WISE', 'PAYPAL', 'CASH_IN_PERSON', 'OTHER')),
  fiat_amount     NUMERIC(36,18) NOT NULL CHECK (fiat_amount > 0),
  rate            NUMERIC(36,18) NOT NULL CHECK (rate > 0),
  rate_source     TEXT NOT NULL,
  fee_percentage  NUMERIC(5,4) NOT NULL CHECK (fee_percentage >= 0 AND fee_percentage <= 100),
  fee_amount      NUMERIC(36,18) NOT NULL CHECK (fee_amount >= 0),
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE trades ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES trade_quotes(id) ON DELETE RESTRICT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS fiat_amount NUMERIC(36,18);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS rate NUMERIC(36,18);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS rate_source TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS fee_percentage_snapshot NUMERIC(5,4);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(36,18);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS quote_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_trade_quotes_expires_at ON trade_quotes (expires_at);
CREATE INDEX IF NOT EXISTS idx_trades_quote_id ON trades (quote_id) WHERE quote_id IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('004_trade_quotes')
ON CONFLICT (version) DO NOTHING;

COMMIT;
