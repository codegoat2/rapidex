-- Migration 008: Panel flow v2
--
-- Adds:
--   • New fiat methods: BINANCE_GIFT_CARD, PAYSAFE, APPLE_PAY, CASHAPP
--   • New trade directions: SWAP, FIAT_TO_FIAT
--   • New columns on trades: swap_to_asset, fiat_to_method, user_note
--   • user_note column on trade_quotes

BEGIN;

-- ── trades: new direction values ──────────────────────────────────────────
-- Postgres CHECK constraints must be dropped and recreated to add values.
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_direction_check;
ALTER TABLE trades ADD CONSTRAINT trades_direction_check
  CHECK (direction IN ('BUY', 'SELL', 'SWAP', 'FIAT_TO_FIAT'));

-- ── trades: new fiat_method values ───────────────────────────────────────
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_fiat_method_check;
ALTER TABLE trades ADD CONSTRAINT trades_fiat_method_check
  CHECK (fiat_method IN (
    'BANK_TRANSFER', 'REVOLUT', 'WISE', 'PAYPAL', 'CASH_IN_PERSON',
    'BINANCE_GIFT_CARD', 'PAYSAFE', 'APPLE_PAY', 'CASHAPP', 'OTHER'
  ));

-- ── trades: new columns ───────────────────────────────────────────────────
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS swap_to_asset  TEXT  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fiat_to_method TEXT  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS user_note      TEXT  DEFAULT NULL;

-- ── trade_quotes: user_note column ───────────────────────────────────────
ALTER TABLE trade_quotes
  ADD COLUMN IF NOT EXISTS user_note TEXT DEFAULT NULL;

-- ── trade_quotes: new direction + fiat_method constraints ─────────────────
ALTER TABLE trade_quotes DROP CONSTRAINT IF EXISTS trade_quotes_direction_check;
ALTER TABLE trade_quotes ADD CONSTRAINT trade_quotes_direction_check
  CHECK (direction IN ('BUY', 'SELL', 'SWAP', 'FIAT_TO_FIAT'));

ALTER TABLE trade_quotes DROP CONSTRAINT IF EXISTS trade_quotes_fiat_method_check;
ALTER TABLE trade_quotes ADD CONSTRAINT trade_quotes_fiat_method_check
  CHECK (fiat_method IN (
    'BANK_TRANSFER', 'REVOLUT', 'WISE', 'PAYPAL', 'CASH_IN_PERSON',
    'BINANCE_GIFT_CARD', 'PAYSAFE', 'APPLE_PAY', 'CASHAPP', 'OTHER'
  ));

INSERT INTO schema_migrations (version) VALUES ('008_panel_flow_v2')
ON CONFLICT (version) DO NOTHING;

COMMIT;
