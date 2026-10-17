CREATE TABLE "blog_posts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "blog_posts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'Nurturance' NOT NULL,
	"body_markdown" text DEFAULT '' NOT NULL,
	"cover_image_path" text,
	"cover_image_alt" text,
	"cover_image_width" integer,
	"cover_image_height" integer,
	"closing_line" text,
	"quote_text" text,
	"quote_citation" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug"),
	CONSTRAINT "blog_posts_status_valid" CHECK ("blog_posts"."status" in ('draft', 'published')),
	CONSTRAINT "blog_posts_slug_format" CHECK ("blog_posts"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "blog_posts_published_has_date" CHECK ("blog_posts"."status" <> 'published' or "blog_posts"."published_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "blog_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blog_posts_status_published_idx" ON "blog_posts" USING btree ("status","published_at" DESC NULLS LAST);