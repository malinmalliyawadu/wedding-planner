ALTER TABLE "photos" ADD COLUMN "booth_session_id" text;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_booth_session_id_unique" UNIQUE("booth_session_id");