CREATE TABLE "run_sheet_item_recipients" (
	"item_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	CONSTRAINT "run_sheet_item_recipients_item_id_recipient_id_pk" PRIMARY KEY("item_id","recipient_id")
);
--> statement-breakpoint
CREATE TABLE "run_sheet_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time,
	"title" text NOT NULL,
	"detail" text,
	"location" text,
	"lead" text
);
--> statement-breakpoint
CREATE TABLE "run_sheet_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_sheet_item_recipients" ADD CONSTRAINT "run_sheet_item_recipients_item_id_run_sheet_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."run_sheet_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_sheet_item_recipients" ADD CONSTRAINT "run_sheet_item_recipients_recipient_id_run_sheet_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."run_sheet_recipients"("id") ON DELETE cascade ON UPDATE no action;