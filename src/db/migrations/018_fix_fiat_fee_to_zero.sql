-- Migration 018: Set fiat fee config to 10% (0.1 in decimal notation)

BEGIN;

UPDATE fiat_fee_config
SET fee_percentage = 0.1, updated_by_discord_id = 'SYSTEM', updated_at = NOW()
WHERE currency IN ('EUR', 'USD', 'GBP');

INSERT INTO schema_migrations (version) VALUES ('018_fix_fiat_fee_to_zero')
ON CONFLICT (version) DO NOTHING;

COMMIT;
