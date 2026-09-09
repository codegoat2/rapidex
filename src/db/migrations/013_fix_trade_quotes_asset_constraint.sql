-- Migration 013: Fix trade_quotes asset constraint
--
-- Migration 007 updated the asset CHECK on trades, ledger_entries,
-- deposit_addresses, hot_wallet_balances, and fee_config — but missed
-- trade_quotes. The table still only allows the original six asset values
-- from migration 004, causing "violates check constraint trade_quotes_asset_check"
-- whenever a user creates a BUY/SELL quote for SOL, BNB, or USDT_BEP20.

BEGIN;

ALTER TABLE trade_quotes DROP CONSTRAINT IF EXISTS trade_quotes_asset_check;
ALTER TABLE trade_quotes ADD CONSTRAINT trade_quotes_asset_check
  CHECK (asset IN ('BTC', 'LTC', 'ETH', 'SOL', 'BNB', 'USDT_BEP20',
                   'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL'));  -- legacy values kept for existing rows

INSERT INTO schema_migrations (version) VALUES ('013_fix_trade_quotes_asset_constraint')
ON CONFLICT (version) DO NOTHING;

COMMIT;
