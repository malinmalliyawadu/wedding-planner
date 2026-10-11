CREATE TYPE "public"."dj_item_status" AS ENUM('queued', 'cued', 'needs_help', 'playing', 'played', 'skipped', 'removed', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."dj_vote_kind" AS ENUM('up', 'skip');--> statement-breakpoint
CREATE TABLE "dj_floor" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"open" boolean DEFAULT false NOT NULL,
	"skip_votes_needed" integer DEFAULT 5 NOT NULL,
	"bridge_seen_at" timestamp with time zone,
	CONSTRAINT "dj_floor_singleton" CHECK ("dj_floor"."id" = 1),
	CONSTRAINT "dj_floor_skip_votes_positive" CHECK ("dj_floor"."skip_votes_needed" > 0)
);
--> statement-breakpoint
CREATE TABLE "dj_queue_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text,
	"external_id" text,
	"song_key" text NOT NULL,
	"household_id" integer,
	"status" "dj_item_status" DEFAULT 'queued' NOT NULL,
	"skip_requested" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cued_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dj_votes" (
	"item_id" integer NOT NULL,
	"household_id" integer NOT NULL,
	"kind" "dj_vote_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dj_votes_item_id_household_id_kind_pk" PRIMARY KEY("item_id","household_id","kind")
);
--> statement-breakpoint
ALTER TABLE "dj_queue_items" ADD CONSTRAINT "dj_queue_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dj_votes" ADD CONSTRAINT "dj_votes_item_id_dj_queue_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."dj_queue_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dj_votes" ADD CONSTRAINT "dj_votes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dj_queue_items_active_song" ON "dj_queue_items" USING btree ("song_key") WHERE "dj_queue_items"."status" in ('queued', 'cued', 'needs_help', 'playing');