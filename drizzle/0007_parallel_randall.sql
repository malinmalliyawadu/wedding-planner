ALTER TABLE "venues" ALTER COLUMN "per_head_cost_cents" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "venues" ALTER COLUMN "per_head_cost_cents" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "catering_per_head_cents" integer DEFAULT 14500 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "catering_per_child_cents" integer DEFAULT 7000;--> statement-breakpoint
-- Zero was the old column default and the old form's default, so every
-- zero in here means "nothing was entered", not "they feed everyone for
-- nothing". Null now says that, and the comparison prices those venues
-- with an outside caterer instead of leaving the dinner out.
UPDATE "venues" SET "per_head_cost_cents" = NULL WHERE "per_head_cost_cents" = 0;