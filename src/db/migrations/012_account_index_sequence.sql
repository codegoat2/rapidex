-- Migration 012: Exchanger account index sequence
--
-- Replaces the fragile SPLIT_PART(derivation_path) approach with an
-- atomic counter table. Each exchanger gets a unique, monotonically
-- increasing account index that is never reused even if addresses are
-- deleted.

BEGIN;

CREATE TABLE IF NOT EXISTS exchanger_account_seq (
  id           BIGSERIAL PRIMARY KEY,  -- never used; just drives auto-increment
  exchanger_id UUID NOT NULL UNIQUE REFERENCES exchangers(id) ON DELETE CASCADE,
  account_index INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_seq_exchanger ON exchanger_account_seq (exchanger_id);

-- Back-fill existing exchangers from their existing derivation paths
-- so the sequence stays consistent with what's already in the DB.
INSERT INTO exchanger_account_seq (exchanger_id, account_index)
SELECT DISTINCT ON (exchanger_id)
  exchanger_id,
  CAST(
    SPLIT_PART(SPLIT_PART(derivation_path, '''/', 3), '/', 1)
    AS INTEGER
  ) AS account_index
FROM deposit_addresses
ON CONFLICT (exchanger_id) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('012_account_index_sequence')
ON CONFLICT (version) DO NOTHING;

COMMIT;
