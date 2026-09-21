-- MANUAL PREPARATION ONLY: pause ALL payment writers/workers; review/back up the
-- intended database first. Run before the unchanged SEC-02 migration, never
-- on a database where payload_digest already exists. Apply remaining migrations
-- and deploy the new writer before resuming traffic. No raw payload copies.
BEGIN;
LOCK TABLE payment_events IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'payment_events' AND column_name = 'payload_digest') THEN
    RAISE EXCEPTION 'SEC-02 already applied; preparation is not appropriate';
  END IF;
END $$;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS retention_upgrade_digest varchar(64);
-- Save original JSONB digests before replacing impossible replay shapes. A
-- missing data key is already safe in SEC-02 and needs no modification.
UPDATE payment_events
SET retention_upgrade_digest = coalesce(retention_upgrade_digest, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex')),
    payload = jsonb_build_object('event', event_type, 'data', '{}'::jsonb)
WHERE provider = 'paystack'
  AND (event_type = 'charge.success' OR event_type LIKE 'refund.%')
  AND payload->'data' IS NOT NULL AND jsonb_typeof(payload->'data') <> 'object';
COMMIT;
