-- Migration 016: fiat-denominated fee configuration

BEGIN;

CREATE TABLE IF NOT EXISTS fiat_fee_config (
  currency              TEXT PRIMARY KEY CHECK (currency IN ('EUR','USD','GBP')),
  fee_percentage        NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (fee_percentage >= 0 AND fee_percentage <= 10000),
  min_fee_amount        NUMERIC(36,18) NOT NULL DEFAULT 0 CHECK (min_fee_amount >= 0),
  updated_by_discord_id TEXT NOT NULL DEFAULT 'SYSTEM',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Set default fees: 0% (no fee) for all currencies
INSERT INTO fiat_fee_config (currency, fee_percentage, min_fee_amount)
VALUES ('EUR', 0, 0), ('USD', 0, 0), ('GBP', 0, 0)
ON CONFLICT (currency) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('016_fiat_fee_config')
ON CONFLICT (version) DO NOTHING;

COMMIT;
