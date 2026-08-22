ALTER TABLE "contact_submissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE "contact_submissions" IS
  'Contact enquiries accepted only through the validated Nuxt server API.';
