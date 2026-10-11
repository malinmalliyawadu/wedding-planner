ALTER TABLE "dj_votes" DROP CONSTRAINT "dj_votes_item_id_household_id_kind_pk";--> statement-breakpoint
ALTER TABLE "dj_votes" ALTER COLUMN "household_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dj_floor" ADD COLUMN "share_code" text;--> statement-breakpoint
ALTER TABLE "dj_queue_items" ADD COLUMN "phone_key" text;--> statement-breakpoint
ALTER TABLE "dj_votes" ADD COLUMN "phone_key" text;--> statement-breakpoint
ALTER TABLE "dj_votes" ADD CONSTRAINT "dj_votes_household" UNIQUE("item_id","household_id","kind");--> statement-breakpoint
ALTER TABLE "dj_votes" ADD CONSTRAINT "dj_votes_phone" UNIQUE("item_id","phone_key","kind");--> statement-breakpoint
ALTER TABLE "dj_queue_items" ADD CONSTRAINT "dj_queue_items_one_asker" CHECK ("dj_queue_items"."household_id" is null or "dj_queue_items"."phone_key" is null);--> statement-breakpoint
ALTER TABLE "dj_votes" ADD CONSTRAINT "dj_votes_one_asker" CHECK (("dj_votes"."household_id" is null) <> ("dj_votes"."phone_key" is null));