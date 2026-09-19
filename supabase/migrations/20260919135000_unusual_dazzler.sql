CREATE TABLE "abuse_limits" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "abuse_limits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bucket_key" varchar(200) NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abuse_limits_request_count_positive" CHECK ("abuse_limits"."request_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "abuse_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "abuse_limits_bucket_key_unique" ON "abuse_limits" USING btree ("bucket_key");--> statement-breakpoint
CREATE INDEX "abuse_limits_reset_at_idx" ON "abuse_limits" USING btree ("reset_at");
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		REVOKE ALL ON TABLE "abuse_limits" FROM anon;
		REVOKE ALL ON SEQUENCE "abuse_limits_id_seq" FROM anon;
	END IF;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		REVOKE ALL ON TABLE "abuse_limits" FROM authenticated;
		REVOKE ALL ON SEQUENCE "abuse_limits_id_seq" FROM authenticated;
	END IF;
END
$$;
