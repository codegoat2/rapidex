-- Migration 011: Exchanger Terms & Conditions
--
-- Adds:
--   • terms_and_conditions column on exchangers (nullable TEXT)
--   • exchanger_tc_acceptances table — records every time a user
--     accepts an exchanger's T&C before claiming a trade

BEGIN;

-- ── exchangers: per-exchanger T&C text ────────────────────────────────────
ALTER TABLE exchangers
  ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT DEFAULT NULL;

-- ── exchanger_tc_acceptances ──────────────────────────────────────────────
-- One row per (user, exchanger) acceptance.  The tc_hash fingerprints the
-- exact text so we can re-prompt when the exchanger updates their terms.
CREATE TABLE IF NOT EXISTS exchanger_tc_acceptances (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_discord_id TEXT        NOT NULL,
  exchanger_id    UUID        NOT NULL REFERENCES exchangers(id) ON DELETE CASCADE,
  tc_hash         TEXT        NOT NULL,   -- SHA-256 hex of the accepted T&C text
  trade_id        UUID        REFERENCES trades(id) ON DELETE SET NULL,
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A user can accept the same T&C version more than once (across trades),
  -- but we only need the latest — use a partial unique index on (user, exchanger, tc_hash)
  UNIQUE (user_discord_id, exchanger_id, tc_hash)
);

CREATE INDEX IF NOT EXISTS idx_tc_acceptances_user ON exchanger_tc_acceptances (user_discord_id);
CREATE INDEX IF NOT EXISTS idx_tc_acceptances_exchanger ON exchanger_tc_acceptances (exchanger_id);

INSERT INTO schema_migrations (version) VALUES ('011_exchanger_terms')
ON CONFLICT (version) DO NOTHING;

COMMIT;
