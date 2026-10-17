ALTER TABLE "programs" DROP COLUMN "peek";--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "preview" jsonb;
