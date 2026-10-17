-- Volumes become the top level: Volume → Programs. Each program now carries its
-- own price and PDF (copied from program_volumes, which 0009 removes).
-- Volume 1 starts switched on; any other volume starts off.
INSERT INTO "volumes" ("number", "name", "is_active")
SELECT n, 'Volume ' || n, n = 1
FROM (SELECT 1 AS n UNION SELECT DISTINCT "volume_number" FROM "program_volumes") AS numbers
ON CONFLICT ("number") DO NOTHING;
--> statement-breakpoint
-- A program's later volumes (Beginner · Volume 2) become programs of their own in that volume.
INSERT INTO "programs" (
  "slug", "name", "title", "summary", "description", "audience", "tags", "tone", "illustration",
  "series", "step", "marker", "sort_order", "status", "published_at", "created_by", "updated_by",
  "volume_id", "price_cents", "file_path", "file_name", "file_size_bytes", "file_sha256",
  "file_version", "file_uploaded_at", "file_uploaded_by"
)
SELECT
  pv."slug", p."name", p."title", p."summary", p."description", p."audience", p."tags", p."tone", p."illustration",
  p."series", p."step", p."marker", p."sort_order", p."status", p."published_at", p."created_by", p."updated_by",
  v."id", pv."price_cents", pv."file_path", pv."file_name", pv."file_size_bytes", pv."file_sha256",
  pv."file_version", pv."file_uploaded_at", pv."file_uploaded_by"
FROM "program_volumes" pv
JOIN "programs" p ON p."id" = pv."program_id"
JOIN "volumes" v ON v."number" = pv."volume_number"
WHERE pv."volume_number" > (SELECT min(x."volume_number") FROM "program_volumes" x WHERE x."program_id" = pv."program_id");
--> statement-breakpoint
-- Each existing program takes over its first volume: slug (the checkout slug), price and PDF.
UPDATE "programs" p SET
  "slug" = pv."slug",
  "volume_id" = v."id",
  "price_cents" = pv."price_cents",
  "file_path" = pv."file_path",
  "file_name" = pv."file_name",
  "file_size_bytes" = pv."file_size_bytes",
  "file_sha256" = pv."file_sha256",
  "file_version" = pv."file_version",
  "file_uploaded_at" = pv."file_uploaded_at",
  "file_uploaded_by" = pv."file_uploaded_by"
FROM "program_volumes" pv
JOIN "volumes" v ON v."number" = pv."volume_number"
WHERE pv."program_id" = p."id"
  AND pv."volume_number" = (SELECT min(x."volume_number") FROM "program_volumes" x WHERE x."program_id" = p."id");
--> statement-breakpoint
-- Programs that never had a volume go into Volume 1 with a placeholder price.
UPDATE "programs" SET
  "slug" = "slug" || '-volume-1',
  "volume_id" = (SELECT "id" FROM "volumes" WHERE "number" = 1),
  "price_cents" = 39900
WHERE "volume_id" IS NULL;
