CREATE TYPE "public"."venue_judge" AS ENUM('a', 'b');--> statement-breakpoint
CREATE TABLE "venue_comparisons" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_a_id" integer NOT NULL,
	"venue_b_id" integer NOT NULL,
	"winner_id" integer,
	"judge" "venue_judge" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_comparisons_pair_judge" UNIQUE("venue_a_id","venue_b_id","judge"),
	CONSTRAINT "venue_comparisons_ordered_pair" CHECK ("venue_comparisons"."venue_a_id" < "venue_comparisons"."venue_b_id"),
	CONSTRAINT "venue_comparisons_winner_in_pair" CHECK ("venue_comparisons"."winner_id" is null or "venue_comparisons"."winner_id" in ("venue_comparisons"."venue_a_id", "venue_comparisons"."venue_b_id"))
);
--> statement-breakpoint
ALTER TABLE "venue_comparisons" ADD CONSTRAINT "venue_comparisons_venue_a_id_venues_id_fk" FOREIGN KEY ("venue_a_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_comparisons" ADD CONSTRAINT "venue_comparisons_venue_b_id_venues_id_fk" FOREIGN KEY ("venue_b_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_comparisons" ADD CONSTRAINT "venue_comparisons_winner_id_venues_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;