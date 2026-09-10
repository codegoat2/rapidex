-- Migration 014: Add CHANNEL_HISTORY bot setting
--
-- Adds the CHANNEL_HISTORY key to bot_settings so admins can configure
-- the Discord channel where completed trade history cards are posted.

BEGIN;

INSERT INTO bot_settings (key, value, description, category, updated_by, updated_at)
VALUES (
  'CHANNEL_HISTORY',
  '',
  'Discord channel ID where completed trade history/transcript cards are posted',
  'discord',
  'SYSTEM',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('014_history_channel_setting')
ON CONFLICT (version) DO NOTHING;

COMMIT;
