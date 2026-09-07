-- Migration 007: Add BNB and USDT_BEP20 assets, remove USDC_ERC20 and USDC_SPL
--
-- Supported tradeable assets after this migration:
--   BTC, LTC, ETH, SOL, BNB, USDT_BEP20
--
-- Chain gains 'bsc' for Binance Smart Chain.
--
-- NOTE: This schema uses TEXT + CHECK constraints (not native PG enums),
-- so we DROP/ADD constraints to extend the allowed value sets.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend chain CHECK constraint to include 'bsc'
-- ---------------------------------------------------------------------------

-- deposit_addresses
ALTER TABLE deposit_addresses DROP CONSTRAINT IF EXISTS deposit_addresses_chain_check;
ALTER TABLE deposit_addresses ADD CONSTRAINT deposit_addresses_chain_check
  CHECK (chain IN ('bitcoin', 'litecoin', 'ethereum', 'solana', 'bsc'));

-- hot_wallet_balances
ALTER TABLE hot_wallet_balances DROP CONSTRAINT IF EXISTS hot_wallet_balances_chain_check;
ALTER TABLE hot_wallet_balances ADD CONSTRAINT hot_wallet_balances_chain_check
  CHECK (chain IN ('bitcoin', 'litecoin', 'ethereum', 'solana', 'bsc'));

-- ---------------------------------------------------------------------------
-- 2. Extend asset CHECK constraints to include 'BNB' and 'USDT_BEP20'
-- ---------------------------------------------------------------------------

-- deposit_addresses
ALTER TABLE deposit_addresses DROP CONSTRAINT IF EXISTS deposit_addresses_asset_check;
ALTER TABLE deposit_addresses ADD CONSTRAINT deposit_addresses_asset_check
  CHECK (asset IN ('BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL', 'SOL', 'BNB', 'USDT_BEP20'));

-- trades
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_asset_check;
ALTER TABLE trades ADD CONSTRAINT trades_asset_check
  CHECK (asset IN ('BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL', 'SOL', 'BNB', 'USDT_BEP20'));

-- ledger_entries
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_asset_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_asset_check
  CHECK (asset IN ('BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL', 'SOL', 'BNB', 'USDT_BEP20'));

-- hot_wallet_balances
ALTER TABLE hot_wallet_balances DROP CONSTRAINT IF EXISTS hot_wallet_balances_asset_check;
ALTER TABLE hot_wallet_balances ADD CONSTRAINT hot_wallet_balances_asset_check
  CHECK (asset IN ('BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL', 'SOL', 'BNB', 'USDT_BEP20'));

-- fee_config
ALTER TABLE fee_config DROP CONSTRAINT IF EXISTS fee_config_asset_check;
ALTER TABLE fee_config ADD CONSTRAINT fee_config_asset_check
  CHECK (asset IN ('BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL', 'SOL', 'BNB', 'USDT_BEP20'));

-- ---------------------------------------------------------------------------
-- 3. Remove rows that reference the old USDC assets from fee_config
--    (safe to delete — no trades have been settled with these assets yet;
--     if you have live data, migrate or archive them first)
-- ---------------------------------------------------------------------------

DELETE FROM fee_config WHERE asset IN ('USDC_ERC20', 'USDC_SPL');

-- ---------------------------------------------------------------------------
-- 4. Seed default fee config rows for the new assets
-- ---------------------------------------------------------------------------

INSERT INTO fee_config (asset, fee_percentage, min_fee_amount, updated_by_discord_id)
VALUES
  ('BNB',        '0.5', '0.001', 'SYSTEM'),
  ('USDT_BEP20', '0.5', '0.5',   'SYSTEM')
ON CONFLICT (asset) DO NOTHING;

-- ---------------------------------------------------------------------------
-- NOTE: The USDC_ERC20 and USDC_SPL values remain in the CHECK constraints
-- for backward compatibility with any existing rows. They will simply remain
-- unused — no new trades, addresses, or ledger entries will reference them.
-- ---------------------------------------------------------------------------

INSERT INTO schema_migrations (version) VALUES ('007_bnb_bep20_assets')
ON CONFLICT (version) DO NOTHING;

COMMIT;
