-- ============================================================
-- Migration 005: configurable trade amount limits
-- ============================================================

BEGIN;

INSERT INTO bot_settings (key, value, description, category) VALUES
  ('MIN_TRADE_AMOUNT', '0.000001', 'Minimum crypto amount accepted for a trade', 'limits'),
  ('MAX_TRADE_AMOUNT', '1000000', 'Maximum crypto amount accepted for a trade', 'limits')
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('005_trade_limits')
ON CONFLICT (version) DO NOTHING;

COMMIT;