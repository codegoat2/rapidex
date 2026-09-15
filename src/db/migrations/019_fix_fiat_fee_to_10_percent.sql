-- Migration 019: Fix fiat fee from 50% to 10% (0.1 in decimal notation)

BEGIN;

UPDATE fiat_fee_config
SET fee_percentage = 0.1, updated_by_discord_id = 'SYSTEM', updated_at = NOW()
WHERE currency IN ('EUR', 'USD', 'GBP');

INSERT INTO schema_migrations (version) VALUES ('019_fix_fiat_fee_to_10_percent')
ON CONFLICT (version) DO NOTHING;

COMMIT;
