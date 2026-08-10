ALTER TABLE "tasks" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "needs_confirmation" boolean DEFAULT false NOT NULL;