CREATE TABLE "faq_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"household_id" integer,
	"uploader_name" text,
	"storage_key" text NOT NULL,
	"thumb_storage_key" text,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"caption" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "photos_thumb_storage_key_unique" UNIQUE("thumb_storage_key")
);
--> statement-breakpoint
CREATE TABLE "public_site" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"welcome_message" text,
	"venue_name" text,
	"venue_address" text,
	"venue_map_url" text,
	"arrival_time" time,
	"ceremony_time" time,
	"dress_code" text,
	"gift_note" text,
	"travel_notes" text,
	"accommodation_notes" text,
	"rsvp_deadline" date,
	"photos_enabled" boolean DEFAULT true NOT NULL,
	"table_reveal_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "public_site_singleton" CHECK ("public_site"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "invite_token" text;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "rsvp_responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "rsvp_message" text;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "song_request" text;--> statement-breakpoint
ALTER TABLE "run_sheet_items" ADD COLUMN "guest_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "run_sheet_items" ADD COLUMN "guest_note" text;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_invite_token_unique" UNIQUE("invite_token");