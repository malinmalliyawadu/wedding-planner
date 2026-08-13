CREATE TYPE "public"."venue_status" AS ENUM('considering', 'shortlisted', 'booked', 'ruled_out');--> statement-breakpoint
CREATE TABLE "venues" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" "venue_status" DEFAULT 'considering' NOT NULL,
	"locality" text,
	"address" text,
	"url" text,
	"seated_capacity" integer,
	"standing_capacity" integer,
	"hire_fixed_cost_cents" integer DEFAULT 0 NOT NULL,
	"per_head_cost_cents" integer DEFAULT 0 NOT NULL,
	"per_child_cost_cents" integer,
	"minimum_spend_cents" integer,
	"date_available" boolean,
	"travel_minutes" integer,
	"curfew" time,
	"site_visit_date" date,
	"hire_includes" text,
	"notes" text,
	CONSTRAINT "venues_seated_capacity_positive" CHECK ("venues"."seated_capacity" is null or "venues"."seated_capacity" > 0),
	CONSTRAINT "venues_standing_capacity_positive" CHECK ("venues"."standing_capacity" is null or "venues"."standing_capacity" > 0),
	CONSTRAINT "venues_travel_minutes_non_negative" CHECK ("venues"."travel_minutes" is null or "venues"."travel_minutes" >= 0)
);
