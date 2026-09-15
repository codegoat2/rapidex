-- Migration 017: Fiat-to-Fiat Exchange with Crypto Collateral Tracking
-- 
-- For fiat-to-fiat exchanges, the bot holds crypto as collateral/security.
-- The buyer and exchanger handle fiat transfer manually (off-chain).
-- This migration adds collateral tracking fields to the trades table.
--
-- Key fields:
--   collateral_asset:        Which crypto is held (BTC, LTC, ETH, USDT, SOL, etc.)
--   collateral_amount:       Amount of that crypto held as collateral
--   collateral_locked_at:    Timestamp when bot locked the collateral (at CLAIMED state)
--   collateral_released_at:  Timestamp when bot released the collateral (at COMPLETED state)
--   collateral_tx_id:        Transaction ID when collateral was released to exchanger

BEGIN;

-- Add collateral tracking columns to trades table
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS collateral_asset TEXT CHECK (
    collateral_asset IS NULL OR collateral_asset IN (
      'BTC', 'LTC', 'ETH', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SPL', 'BNB', 'USDT_BEP20'
    )
  ),
  ADD COLUMN IF NOT EXISTS collateral_amount NUMERIC(36,18) CHECK (
    collateral_amount IS NULL OR collateral_amount > 0
  ),
  ADD COLUMN IF NOT EXISTS collateral_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collateral_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collateral_tx_id TEXT;

-- Create index for collateral tracking
CREATE INDEX IF NOT EXISTS idx_trades_collateral_locked ON trades (collateral_locked_at) 
  WHERE collateral_locked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_collateral_released ON trades (collateral_released_at) 
  WHERE collateral_released_at IS NOT NULL;

-- Add descriptive comment
COMMENT ON COLUMN trades.collateral_asset IS 'Crypto asset held as collateral for fiat-to-fiat trades (e.g., BTC, ETH, USDT)';
COMMENT ON COLUMN trades.collateral_amount IS 'Amount of collateral_asset held as security';
COMMENT ON COLUMN trades.collateral_locked_at IS 'When the bot locked the collateral after exchanger claimed the trade';
COMMENT ON COLUMN trades.collateral_released_at IS 'When the bot released the collateral to the exchanger after trade completion';
COMMENT ON COLUMN trades.collateral_tx_id IS 'Transaction ID when collateral was sent to exchanger wallet';

-- Record migration
INSERT INTO schema_migrations (version) VALUES ('017_fiat_collateral_tracking')
ON CONFLICT (version) DO NOTHING;

COMMIT;
