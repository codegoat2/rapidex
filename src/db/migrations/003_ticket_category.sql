-- ============================================================
-- Migration 003: ticket category setting
-- ============================================================

BEGIN;

INSERT INTO bot_settings (key, value, description, category)
VALUES (
  'TICKET_CATEGORY_ID',
  '',
  'Discord category ID where new trade tickets are created',
  'discord'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('003_ticket_category')
ON CONFLICT (version) DO NOTHING;

COMMIT;