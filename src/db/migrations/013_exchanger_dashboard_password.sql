-- Migration 013: Exchanger dashboard password
-- Stores a bcrypt hash of the password set via /setpass
-- Only verified exchangers can set this

BEGIN;

ALTER TABLE exchangers
  ADD COLUMN IF NOT EXISTS dashboard_password_hash TEXT;

INSERT INTO schema_migrations (version) VALUES ('013_exchanger_dashboard_password')
ON CONFLICT (version) DO NOTHING;

COMMIT;
