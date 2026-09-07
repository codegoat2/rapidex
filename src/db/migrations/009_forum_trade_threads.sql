-- Migration 009: forum-backed trade claiming
--
-- Open trades keep their private ticket in the configured ticket category.
-- The forum thread is the exchanger-facing claim surface.

BEGIN;

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS forum_thread_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_trades_forum_thread_id
  ON trades (forum_thread_id)
  WHERE forum_thread_id IS NOT NULL;

INSERT INTO bot_settings (key, value, description, category) VALUES
  ('FORUM_CHANNEL_ID', '', 'Discord Forum channel where open trades are posted for exchangers to claim', 'discord')
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('009_forum_trade_threads')
ON CONFLICT (version) DO NOTHING;

COMMIT;