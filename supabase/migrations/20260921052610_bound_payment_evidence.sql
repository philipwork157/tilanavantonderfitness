-- Versioned retention projector. Keep parity with paystack-event-evidence.ts;
-- JSON object checks precede every object traversal, including nested evidence.
CREATE FUNCTION payment_evidence_project_v1(source jsonb, kind text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  allowed text[]; required text[]; k text; v jsonb; s text; valid boolean;
  result jsonb := '{}'::jsonb; rejected boolean := false;
BEGIN
  CASE kind
    WHEN 'charge' THEN
      allowed := ARRAY['id','reference','status','amount','currency','fees','channel','paid_at','domain'];
      required := ARRAY['reference','status','amount','currency','domain'];
    WHEN 'refund' THEN
      allowed := ARRAY['id','transaction_reference','refund_reference','status','amount','currency','domain','refunded_at','expected_at'];
      required := ARRAY['transaction_reference','amount','currency','domain'];
    WHEN 'dispute' THEN
      allowed := ARRAY['id','domain','status','resolution','refund_amount'];
      required := ARRAY['id','domain','status'];
    WHEN 'transaction' THEN
      allowed := ARRAY['id','reference','domain','amount','currency'];
      required := allowed;
    ELSE RAISE EXCEPTION 'Unknown evidence group';
  END CASE;
  IF jsonb_typeof(source) IS DISTINCT FROM 'object' THEN source := '{}'::jsonb; END IF;
  FOREACH k IN ARRAY required LOOP
    IF source->k IS NULL OR source->k = 'null'::jsonb THEN rejected := true; END IF;
  END LOOP;
  FOREACH k IN ARRAY allowed LOOP
    v := source->k;
    IF v IS NULL THEN CONTINUE; END IF;
    s := v #>> '{}';
    valid := v = 'null'::jsonb;
    IF NOT valid THEN
      IF k IN ('amount','fees','refund_amount') AND jsonb_typeof(v) = 'number' THEN
        valid := (s::numeric = trunc(s::numeric) AND s::numeric BETWEEN 0 AND 2147483647);
      ELSIF k IN ('id','refund_reference') AND jsonb_typeof(v) = 'number' THEN
        valid := (s::numeric = trunc(s::numeric) AND s::numeric BETWEEN 1 AND 9007199254740991);
      ELSIF jsonb_typeof(v) = 'string' THEN
        CASE
          WHEN k = 'domain' THEN valid := s IN ('test','live');
          WHEN k = 'currency' THEN valid := s ~ '^[A-Z]{3}$';
          WHEN k IN ('paid_at','refunded_at','expected_at') THEN
            valid := length(s) <= 64 AND s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+Z-]+$';
          WHEN k IN ('reference','transaction_reference') THEN valid := length(s) BETWEEN 1 AND 240 AND s ~ '^[A-Za-z0-9_.:=+-]+$';
          WHEN k = 'channel' THEN valid := length(s) BETWEEN 1 AND 50 AND s ~ '^[A-Za-z0-9_.:=+-]+$';
          WHEN k IN ('id','refund_reference','status','resolution') THEN valid := length(s) BETWEEN 1 AND 100 AND s ~ '^[A-Za-z0-9_.:=+-]+$';
          ELSE valid := false;
        END CASE;
      ELSE valid := false;
      END IF;
    END IF;
    IF valid THEN result := result || jsonb_build_object(k, v); ELSE rejected := true; END IF;
  END LOOP;
  RETURN jsonb_build_object('data', result, 'rejected', rejected);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION sanitize_payment_evidence_v1(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE event text; kind text; projected jsonb; nested jsonb; result jsonb; rejected boolean;
BEGIN
  IF payload = '{"redacted":true}'::jsonb THEN RETURN payload; END IF;
  event := payload->>'event';
  IF event IS NULL OR event NOT IN ('charge.success','refund.pending','refund.processing','refund.processed','refund.failed',
    'refund.needs-attention','charge.dispute.create','charge.dispute.remind','charge.dispute.resolve') THEN
    RETURN '{"event":"unknown","data":{}}'::jsonb;
  END IF;
  kind := CASE WHEN event = 'charge.success' THEN 'charge' WHEN event LIKE 'refund.%' THEN 'refund' ELSE 'dispute' END;
  projected := payment_evidence_project_v1(payload->'data', kind);
  rejected := (projected->>'rejected')::boolean OR coalesce(payload->'evidenceRejected' = 'true'::jsonb, false);
  IF kind = 'dispute' THEN
    nested := payment_evidence_project_v1(payload->'data'->'transaction', 'transaction');
    projected := jsonb_set(projected, '{data,transaction}', nested->'data');
    rejected := rejected OR (nested->>'rejected')::boolean;
  END IF;
  result := jsonb_build_object('event', event, 'data', projected->'data');
  IF rejected THEN result := result || '{"evidenceRejected":true}'::jsonb; END IF;
  RETURN result;
END;
$$;
--> statement-breakpoint
-- The optional, reviewed pre-SEC-02 repair saves only original digests in a
-- temporary column. Restore them before removing that upgrade-only column.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'payment_events' AND column_name = 'retention_upgrade_digest') THEN
    EXECUTE 'UPDATE payment_events SET payload_digest = retention_upgrade_digest WHERE retention_upgrade_digest IS NOT NULL';
    ALTER TABLE payment_events DROP COLUMN retention_upgrade_digest;
  END IF;
END $$;
--> statement-breakpoint
-- Internal recovery rows and their actor links are deliberately untouched.
UPDATE payment_events SET payload = sanitize_payment_evidence_v1(payload)
WHERE provider = 'paystack';
