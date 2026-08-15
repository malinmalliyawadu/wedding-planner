-- A hire fee nobody has been quoted is now null rather than zero.
--
-- Existing zeroes are deliberately left alone, unlike the per-head rates
-- in 0007: a venue that charges no separate hire fee is a real quote you
-- receive all the time (the room is in the per-head package), whereas a
-- venue that feeds 121 people for nothing is not.
ALTER TABLE "venues" ALTER COLUMN "hire_fixed_cost_cents" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "venues" ALTER COLUMN "hire_fixed_cost_cents" DROP NOT NULL;
