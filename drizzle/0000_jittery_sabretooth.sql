CREATE TYPE "public"."age_bracket" AS ENUM('adult', 'child', 'infant');--> statement-breakpoint
CREATE TYPE "public"."constraint_kind" AS ENUM('together', 'apart');--> statement-breakpoint
CREATE TYPE "public"."invite_stage" AS ENUM('not_invited', 'save_the_date', 'invited', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('pending', 'attending', 'declined');--> statement-breakpoint
CREATE TYPE "public"."side" AS ENUM('a', 'b', 'both');--> statement-breakpoint
CREATE TYPE "public"."task_owner" AS ENUM('a', 'b', 'both');--> statement-breakpoint
CREATE TABLE "budget_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"fixed_cost_cents" integer DEFAULT 0 NOT NULL,
	"per_head_cost_cents" integer DEFAULT 0 NOT NULL,
	"per_child_cost_cents" integer,
	"priority_a" smallint DEFAULT 3 NOT NULL,
	"priority_b" smallint DEFAULT 3 NOT NULL,
	"notes" text,
	CONSTRAINT "budget_items_priority_a_range" CHECK ("budget_items"."priority_a" between 1 and 5),
	CONSTRAINT "budget_items_priority_b_range" CHECK ("budget_items"."priority_b" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"source" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" serial PRIMARY KEY NOT NULL,
	"household_id" integer NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"side" "side" DEFAULT 'both' NOT NULL,
	"age_bracket" "age_bracket" DEFAULT 'adult' NOT NULL,
	"dietary_notes" text,
	"rsvp_status" "rsvp_status" DEFAULT 'pending' NOT NULL,
	"table_id" integer
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"invite_stage" "invite_stage" DEFAULT 'not_invited' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "item_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_item_id" integer NOT NULL,
	"label" text NOT NULL,
	"fixed_cost_cents" integer DEFAULT 0 NOT NULL,
	"per_head_cost_cents" integer DEFAULT 0 NOT NULL,
	"per_child_cost_cents" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_item_id" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_date" date NOT NULL,
	"paid_date" date,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "scenario_choices" (
	"scenario_id" integer NOT NULL,
	"budget_item_id" integer NOT NULL,
	"item_option_id" integer,
	"excluded" boolean DEFAULT false NOT NULL,
	CONSTRAINT "scenario_choices_scenario_id_budget_item_id_pk" PRIMARY KEY("scenario_id","budget_item_id")
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"adult_count" integer NOT NULL,
	"child_count" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "seating_constraints" (
	"id" serial PRIMARY KEY NOT NULL,
	"guest_a_id" integer NOT NULL,
	"guest_b_id" integer NOT NULL,
	"kind" "constraint_kind" NOT NULL,
	"weight" smallint NOT NULL,
	CONSTRAINT "seating_constraints_weight_range" CHECK ("seating_constraints"."weight" between 1 and 10),
	CONSTRAINT "seating_constraints_distinct_guests" CHECK ("seating_constraints"."guest_a_id" <> "seating_constraints"."guest_b_id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"partner_a_name" text NOT NULL,
	"partner_b_name" text NOT NULL,
	"wedding_date" date,
	"monthly_contribution_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"capacity" integer NOT NULL,
	CONSTRAINT "tables_capacity_positive" CHECK ("tables"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"due_date" date,
	"owner" "task_owner" DEFAULT 'both' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"category" text
);
--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_options" ADD CONSTRAINT "item_options_budget_item_id_budget_items_id_fk" FOREIGN KEY ("budget_item_id") REFERENCES "public"."budget_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_budget_item_id_budget_items_id_fk" FOREIGN KEY ("budget_item_id") REFERENCES "public"."budget_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_choices" ADD CONSTRAINT "scenario_choices_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_choices" ADD CONSTRAINT "scenario_choices_budget_item_id_budget_items_id_fk" FOREIGN KEY ("budget_item_id") REFERENCES "public"."budget_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_choices" ADD CONSTRAINT "scenario_choices_item_option_id_item_options_id_fk" FOREIGN KEY ("item_option_id") REFERENCES "public"."item_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seating_constraints" ADD CONSTRAINT "seating_constraints_guest_a_id_guests_id_fk" FOREIGN KEY ("guest_a_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seating_constraints" ADD CONSTRAINT "seating_constraints_guest_b_id_guests_id_fk" FOREIGN KEY ("guest_b_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;