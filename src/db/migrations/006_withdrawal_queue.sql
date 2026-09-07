-- ============================================================
-- Migration 006: durable withdrawal queue
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS withdrawals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id       UUID NOT NULL UNIQUE REFERENCES trades(id) ON DELETE RESTRICT,
  exchanger_id   UUID NOT NULL REFERENCES exchangers(id) ON DELETE RESTRICT,
  asset          TEXT NOT NULL CHECK (asset IN ('BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL')),
  amount         NUMERIC(36,18) NOT NULL CHECK (amount > 0),
  destination    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'BROADCAST', 'CONFIRMED', 'FAILED')),
  tx_id         TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_queue ON withdrawals (status, next_attempt_at);

INSERT INTO schema_migrations (version) VALUES ('006_withdrawal_queue')
ON CONFLICT (version) DO NOTHING;

COMMIT;
