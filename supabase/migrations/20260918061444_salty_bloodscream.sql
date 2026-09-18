CREATE TABLE "customer_notifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customer_notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_id" integer NOT NULL,
	"order_id" integer,
	"kind" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_version" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_notifications_kind_valid" CHECK (("customer_notifications"."kind" = 'purchase' and "customer_notifications"."order_id" is not null) or ("customer_notifications"."kind" = 'login' and "customer_notifications"."order_id" is null)),
	CONSTRAINT "customer_notifications_counters_valid" CHECK ("customer_notifications"."attempts" >= 0 and "customer_notifications"."lease_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "customer_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_notifications_key_unique" ON "customer_notifications" USING btree ("deduplication_key");--> statement-breakpoint
CREATE INDEX "customer_notifications_due_idx" ON "customer_notifications" USING btree ("next_attempt_at");