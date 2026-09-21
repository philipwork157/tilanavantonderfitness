ALTER TABLE "payment_events" ADD COLUMN "actor_user_id" integer;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- Recover only genuine integer JSON actor IDs that still identify an application
-- user. Missing, erased, orphaned or malformed attribution stays explicitly NULL.
UPDATE payment_events e SET actor_user_id = u.id
FROM users u
WHERE e.provider = 'internal' AND e.event_type IN ('admin.recovery.reconcile', 'admin.recovery.acknowledge')
AND u.id = CASE
  WHEN jsonb_typeof(e.payload->'administratorUserId') = 'number'
    AND e.payload->>'administratorUserId' ~ '^[1-9][0-9]{0,9}$'
  THEN CASE WHEN (e.payload->>'administratorUserId')::bigint <= 2147483647
    THEN (e.payload->>'administratorUserId')::integer END
END;
--> statement-breakpoint
-- Retain minimal operator audit metadata for the lifetime of the financial
-- ledger. Only payload/expiry columns remain mutable for cleanup.
CREATE FUNCTION protect_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.provider = 'internal'
    AND OLD.event_type IN ('admin.recovery.reconcile', 'admin.recovery.acknowledge') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Recovery audit records cannot be deleted';
    END IF;
    IF (to_jsonb(NEW) - 'payload' - 'payload_expires_at') IS DISTINCT FROM
       (to_jsonb(OLD) - 'payload' - 'payload_expires_at') THEN
      RAISE EXCEPTION 'Recovery audit metadata is immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.provider = 'internal'
    AND NEW.event_type IN ('admin.recovery.reconcile', 'admin.recovery.acknowledge') THEN
    IF TG_OP <> 'INSERT' OR NEW.actor_user_id IS NULL OR NEW.payment_id IS NULL
      OR NEW.processing_status <> 'processed' OR NEW.processed_at IS NULL THEN
      RAISE EXCEPTION 'Recovery audit requires actor, payment and completed action';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER payment_events_protect_recovery_audit
BEFORE INSERT OR UPDATE OR DELETE ON payment_events
FOR EACH ROW EXECUTE FUNCTION protect_recovery_audit();
