CREATE TABLE "song_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"household_id" integer NOT NULL,
	"title" text NOT NULL,
	"artist" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "song_requests" ADD CONSTRAINT "song_requests_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Carry every request already made across as a typed one. Nothing that a
-- guest wrote on their card is lost to the change of shape.
INSERT INTO "song_requests" ("household_id", "title")
SELECT "id", "song_request" FROM "households"
WHERE "song_request" IS NOT NULL AND btrim("song_request") <> '';--> statement-breakpoint
ALTER TABLE "households" DROP COLUMN "song_request";