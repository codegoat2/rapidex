-- Migration 010: standalone exchanger withdrawals

BEGIN;

ALTER TABLE withdrawals
  ALTER COLUMN trade_id DROP NOT NULL;

ALTER TABLE withdrawals DROP CONSTRAINT IF EXISTS withdrawals_asset_check;
ALTER TABLE withdrawals ADD CONSTRAINT withdrawals_asset_check
  CHECK (asset IN ('BTC', 'LTC', 'ETH', 'SOL', 'BNB', 'USDT_BEP20'));

INSERT INTO schema_migrations (version) VALUES ('010_exchanger_withdrawals')
ON CONFLICT (version) DO NOTHING;

COMMIT;