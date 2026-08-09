"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { parseDollarsToCents } from "@/lib/money";

const settingsSchema = z.object({
  partnerAName: z.string().trim().min(1, "Both names are required"),
  partnerBName: z.string().trim().min(1, "Both names are required"),
  weddingDate: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s))
    .refine(
      (s) => s === null || /^\d{4}-\d{2}-\d{2}$/.test(s),
      "Wedding date must be a real date",
    ),
  monthlyContributionCents: z
    .string()
    .trim()
    .transform((s, ctx) => {
      const cents = parseDollarsToCents(s === "" ? "0" : s);
      if (cents === null || cents < 0) {
        ctx.addIssue({ code: "custom", message: `"${s}" is not a dollar amount` });
        return z.NEVER;
      }
      return cents;
    }),
  contributionDayOfMonth: z.coerce
    .number()
    .int()
    .min(1, "Pick a day from 1 to 31")
    .max(31, "Pick a day from 1 to 31"),
});

export async function updateSettings(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse({
    partnerAName: formData.get("partnerAName"),
    partnerBName: formData.get("partnerBName"),
    weddingDate: formData.get("weddingDate") ?? "",
    monthlyContributionCents: formData.get("monthlyContribution") ?? "0",
    contributionDayOfMonth: formData.get("contributionDayOfMonth"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  // The settings row is a singleton seeded with id 1; upsert so a fresh
  // database without a seed still works.
  await db
    .insert(settings)
    .values({ id: 1, ...parsed.data })
    .onConflictDoUpdate({ target: settings.id, set: parsed.data });

  revalidatePath("/", "layout");
  return { status: "success" };
}

/** Used by the savings page so the slider can persist without a full form. */
export async function updateMonthlyContribution(
  cents: number,
): Promise<ActionResult> {
  if (!Number.isInteger(cents) || cents < 0) {
    return { status: "error", message: "Contribution must be a whole amount" };
  }
  await db
    .update(settings)
    .set({ monthlyContributionCents: cents })
    .where(eq(settings.id, 1));
  revalidatePath("/savings");
  revalidatePath("/settings");
  return { status: "success" };
}
