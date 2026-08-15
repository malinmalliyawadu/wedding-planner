"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { venueComparisons } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { orderPair } from "@/lib/venue-ranking";

/**
 * Neither action revalidates, and that is deliberate.
 *
 * Ranking seventy-one venues is a few hundred taps, and the page holds
 * the answers in client state so each one lands instantly. Nothing else
 * on screen is derived from the server between taps, so a revalidate
 * would refetch every venue and re-render the whole table to arrive back
 * at what the page already shows - once per tap. The page is
 * `force-dynamic`, so leaving and coming back reads the truth from the
 * database as normal.
 */

const venueId = z.coerce.number().int().positive();

const verdictShape = z.object({
  leftId: venueId,
  rightId: venueId,
  /** Null is "cannot split them", which is an answer and not a blank. */
  winnerId: venueId.nullable(),
  judge: z.enum(["a", "b"]),
});

const pairShape = verdictShape.pick({
  leftId: true,
  rightId: true,
  judge: true,
});

const verdictSchema = verdictShape
  .refine((v) => v.leftId !== v.rightId, "A venue cannot be compared with itself")
  .refine(
    (v) =>
      v.winnerId === null ||
      v.winnerId === v.leftId ||
      v.winnerId === v.rightId,
    "The winner has to be one of the two venues",
  );

export type Verdict = z.input<typeof verdictSchema>;

export async function recordComparison(input: Verdict): Promise<ActionResult> {
  const parsed = verdictSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const { leftId, rightId, winnerId, judge } = parsed.data;
  const [venueAId, venueBId] = orderPair(leftId, rightId);

  // Which side of the screen a venue was shown on is presentation, so it
  // is normalised away here rather than stored: the pair goes in one way
  // round, and answering it again replaces the verdict instead of
  // stacking a second vote on top of the first.
  await db
    .insert(venueComparisons)
    .values({ venueAId, venueBId, winnerId, judge })
    .onConflictDoUpdate({
      target: [
        venueComparisons.venueAId,
        venueComparisons.venueBId,
        venueComparisons.judge,
      ],
      set: { winnerId, createdAt: sql`now()` },
    });

  return { status: "success" };
}

/**
 * Take back one verdict.
 *
 * Over a few hundred taps a misclick is a certainty rather than a risk,
 * and an answer you cannot retract is one you have to think twice about -
 * which is exactly what makes head-to-head fast in the first place.
 */
export async function undoComparison(
  input: Pick<Verdict, "leftId" | "rightId" | "judge">,
): Promise<ActionResult> {
  const parsed = pairShape.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const [venueAId, venueBId] = orderPair(parsed.data.leftId, parsed.data.rightId);
  await db
    .delete(venueComparisons)
    .where(
      and(
        eq(venueComparisons.venueAId, venueAId),
        eq(venueComparisons.venueBId, venueBId),
        eq(venueComparisons.judge, parsed.data.judge),
      ),
    );

  return { status: "success" };
}
