-- Additive only: retain all existing orders, payments, program editions and files.
CREATE TABLE "order_item_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_item_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_item_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"program_volume_id" integer NOT NULL,
	"program_file_id" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_sha256" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_item_files_size_positive" CHECK ("order_item_files"."size_bytes" > 0),
	CONSTRAINT "order_item_files_digest_format" CHECK ("order_item_files"."content_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "order_item_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "program_files_id_volume_unique" ON "program_files" USING btree ("id","program_volume_id");--> statement-breakpoint
ALTER TABLE "order_item_files" ADD CONSTRAINT "order_item_files_purchase_fk" FOREIGN KEY ("order_item_id","client_id","program_volume_id") REFERENCES "public"."order_items"("id","client_id","program_volume_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_files" ADD CONSTRAINT "order_item_files_edition_fk" FOREIGN KEY ("program_file_id","program_volume_id") REFERENCES "public"."program_files"("id","program_volume_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_item_files_item_file_unique" ON "order_item_files" USING btree ("order_item_id","program_file_id");--> statement-breakpoint
CREATE INDEX "order_item_files_file_idx" ON "order_item_files" USING btree ("program_file_id");--> statement-breakpoint
CREATE FUNCTION protect_purchase_pdf_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Purchased PDF edition snapshots are immutable'
    USING ERRCODE = '23514', CONSTRAINT = 'order_item_files_immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER order_item_files_immutable BEFORE UPDATE OR DELETE ON order_item_files
FOR EACH ROW EXECUTE FUNCTION protect_purchase_pdf_snapshot();
--> statement-breakpoint
CREATE FUNCTION protect_purchased_pdf_storage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.r2_bucket, NEW.r2_object_key, NEW.etag, NEW.size_bytes, NEW.content_type, NEW.upload_status)
    IS DISTINCT FROM (OLD.r2_bucket, OLD.r2_object_key, OLD.etag, OLD.size_bytes, OLD.content_type, OLD.upload_status)
    AND EXISTS (SELECT 1 FROM order_item_files WHERE program_file_id = OLD.id) THEN
    RAISE EXCEPTION 'Purchased PDF storage metadata is immutable. Upload a replacement edition instead.'
      USING ERRCODE = '23514', CONSTRAINT = 'program_files_purchase_snapshot_immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER program_files_purchase_snapshot_immutable BEFORE UPDATE ON program_files
FOR EACH ROW EXECUTE FUNCTION protect_purchased_pdf_storage();
