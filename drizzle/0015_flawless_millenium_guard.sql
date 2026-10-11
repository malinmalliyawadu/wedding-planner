DROP INDEX "dj_queue_items_active_song";--> statement-breakpoint
UPDATE "dj_queue_items" SET "status" = 'unavailable', "ended_at" = coalesce("ended_at", now()) WHERE "status" = 'needs_help';--> statement-breakpoint
ALTER TABLE "dj_queue_items" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "dj_queue_items" ALTER COLUMN "status" SET DEFAULT 'queued'::text;--> statement-breakpoint
DROP TYPE "public"."dj_item_status";--> statement-breakpoint
CREATE TYPE "public"."dj_item_status" AS ENUM('queued', 'cued', 'playing', 'played', 'skipped', 'removed', 'unavailable');--> statement-breakpoint
ALTER TABLE "dj_queue_items" ALTER COLUMN "status" SET DEFAULT 'queued'::"public"."dj_item_status";--> statement-breakpoint
ALTER TABLE "dj_queue_items" ALTER COLUMN "status" SET DATA TYPE "public"."dj_item_status" USING "status"::"public"."dj_item_status";--> statement-breakpoint
CREATE UNIQUE INDEX "dj_queue_items_active_song" ON "dj_queue_items" USING btree ("song_key") WHERE "dj_queue_items"."status" in ('queued', 'cued', 'playing');
