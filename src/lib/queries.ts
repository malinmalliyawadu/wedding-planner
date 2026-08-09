import { cache } from "react";
import { db } from "@/db";
import { settings } from "@/db/schema";

export type Settings = typeof settings.$inferSelect;

/**
 * The singleton settings row, deduped per request so the layout and the
 * page can both call it. Seeded by scripts/seed.ts; the fallback only
 * exists so a fresh unseeded database still renders.
 */
export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await db.select().from(settings).limit(1);
  return (
    rows[0] ?? {
      id: 1,
      partnerAName: "A",
      partnerBName: "B",
      weddingDate: null,
      monthlyContributionCents: 0,
    }
  );
});
