ALTER TABLE "payment_events" ADD COLUMN "payload_digest" varchar(64);--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "payload_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "payment_events"
SET "payload_digest" = encode(sha256(convert_to("payload"::text, 'UTF8')), 'hex');
--> statement-breakpoint
UPDATE "payment_events"
SET "payload" = CASE
	WHEN "event_type" = 'charge.success' THEN jsonb_build_object(
		'event', "event_type",
		'data', (SELECT coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
			FROM jsonb_each(coalesce("payload"->'data', '{}'::jsonb)) AS entry
			WHERE entry.key IN ('id', 'reference', 'status', 'amount', 'currency', 'fees', 'channel', 'gateway_response', 'paid_at', 'domain')))
	WHEN "event_type" LIKE 'refund.%' THEN jsonb_build_object(
		'event', "event_type",
		'data', (SELECT coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
			FROM jsonb_each(coalesce("payload"->'data', '{}'::jsonb)) AS entry
			WHERE entry.key IN ('id', 'transaction_reference', 'refund_reference', 'status', 'amount', 'currency', 'domain', 'refunded_at', 'expected_at')))
	WHEN "event_type" LIKE 'charge.dispute.%' THEN jsonb_build_object(
		'event', "event_type",
		'data', jsonb_build_object(
			'id', "payload"->'data'->'id',
			'domain', "payload"->'data'->'domain',
			'status', "payload"->'data'->'status',
			'resolution', "payload"->'data'->'resolution',
			'refund_amount', "payload"->'data'->'refund_amount',
			'transaction', jsonb_build_object(
				'id', "payload"->'data'->'transaction'->'id',
				'reference', "payload"->'data'->'transaction'->'reference',
				'domain', "payload"->'data'->'transaction'->'domain',
				'amount', "payload"->'data'->'transaction'->'amount',
				'currency', "payload"->'data'->'transaction'->'currency'
			)
		)
	)
	ELSE jsonb_build_object('event', "event_type", 'data', '{}'::jsonb)
END
WHERE "provider" = 'paystack';
--> statement-breakpoint
UPDATE "payment_events"
SET "payload_expires_at" = "received_at" + interval '30 days'
WHERE "processing_status" IN ('processed', 'ignored');
--> statement-breakpoint
ALTER TABLE "payment_events" ALTER COLUMN "payload_digest" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payload_digest_format" CHECK ("payment_events"."payload_digest" ~ '^[a-f0-9]{64}$');
