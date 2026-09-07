-- ============================================================
-- Migration 002: bot_settings table
--
-- Stores runtime-editable configuration that would otherwise
-- require a redeploy to change. The dashboard reads/writes
-- this table. The application reads it at startup and caches
-- with a 60-second TTL.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot_settings (
  key         TEXT        PRIMARY KEY,
  value       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  category    TEXT        NOT NULL DEFAULT 'general',
  updated_by  TEXT        NOT NULL DEFAULT 'SYSTEM',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed all default settings
INSERT INTO bot_settings (key, value, description, category) VALUES
  -- Discord role IDs
  ('ROLE_ADMIN',               '',     'Discord role ID for admins',               'discord'),
  ('ROLE_EXCHANGER',           '',     'Discord role ID for verified exchangers',   'discord'),
  ('CHANNEL_ADMIN_ALERTS',     '',     'Discord channel ID for admin alerts',       'discord'),
  ('CHANNEL_ANNOUNCEMENTS',    '',     'Discord channel ID for announcements',      'discord'),

  -- Trade timeouts
  ('TIMEOUT_OPEN_MINUTES',           '30',  'Minutes before unclaimed trade expires',       'timeouts'),
  ('TIMEOUT_CLAIMED_MINUTES',        '60',  'Minutes before fiat-not-sent trade cancels',   'timeouts'),
  ('TIMEOUT_FIAT_SENT_MINUTES',      '60',  'Minutes before fiat-sent escalates to admin',  'timeouts'),
  ('TIMEOUT_DISPUTED_HOURS',         '24',  'Hours before second admin escalation fires',   'timeouts'),
  ('TIMEOUT_CRYPTO_SENT_CONFIRMATIONS', '2','Required on-chain confirmations for COMPLETED','timeouts'),

  -- Rate limits
  ('RATE_LIMIT_TICKET_PER_USER_PER_HOUR',     '3',  'Max trade tickets a user can open per hour',   'limits'),
  ('RATE_LIMIT_COMMANDS_PER_USER_PER_MINUTE', '10', 'Max commands a user can run per minute',        'limits'),

  -- Hot wallet thresholds
  ('MIN_HOT_WALLET_BTC', '0.01', 'Alert threshold for BTC hot wallet (BTC)',  'thresholds'),
  ('MIN_HOT_WALLET_LTC', '1.0',  'Alert threshold for LTC hot wallet (LTC)',  'thresholds'),
  ('MIN_HOT_WALLET_ETH', '0.1',  'Alert threshold for ETH hot wallet (ETH)',  'thresholds'),
  ('MIN_HOT_WALLET_SOL', '5.0',  'Alert threshold for SOL hot wallet (SOL)',  'thresholds'),

  -- Network
  ('NETWORK', 'testnet', 'Active network: mainnet or testnet', 'network'),

  -- Fee config (mirrors fee_config table — shown for reference, actual source is fee_config)
  ('DEFAULT_FEE_PERCENTAGE', '0.5', 'Default fee % applied to new assets', 'fees'),

  -- Maintenance
  ('MAINTENANCE_MODE', 'false', 'Set true to reject all new trade tickets', 'general'),
  ('BOT_STATUS_MESSAGE', '',    'Optional custom bot status/activity message', 'general')

ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('002_bot_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
