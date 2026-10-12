CREATE TYPE "public"."dj_floor_access" AS ENUM('closed', 'venue', 'everyone');--> statement-breakpoint
ALTER TABLE "dj_floor" ADD COLUMN "access" "dj_floor_access" DEFAULT 'closed' NOT NULL;--> statement-breakpoint
-- Carried across before 0018 drops the old switch: open was open to everyone.
UPDATE "dj_floor" SET "access" = 'everyone' WHERE "open";
