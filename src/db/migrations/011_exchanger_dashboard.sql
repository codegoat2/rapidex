-- 011_exchanger_dashboard.sql
-- Adds dashboard password column for exchangers

BEGIN;

ALTER TABLE exchangers
  ADD COLUMN IF NOT EXISTS dashboard_password_hash TEXT;

COMMIT;
