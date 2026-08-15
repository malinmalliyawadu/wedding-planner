"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { venues } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { parseDollarsToCents } from "@/lib/money";

/** A dollar amount that must be there, and cannot be negative. */
const dollars = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const cents = parseDollarsToCents(s === "" ? "0" : s);
    if (cents === null || cents < 0) {
      ctx.addIssue({
        code: "custom",
        message: `"${s}" is not a dollar amount`,
      });
      return z.NEVER;
    }
    return cents;
  });

/** The same, but blank means "there isn't one" rather than zero. */
const optionalDollars = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (s === "") return null;
    const cents = parseDollarsToCents(s);
    if (cents === null || cents < 0) {
      ctx.addIssue({
        code: "custom",
        message: `"${s}" is not a dollar amount`,
      });
      return z.NEVER;
    }
    return cents;
  });

const optionalCount = (label: string, max: number) =>
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      if (s === "") return null;
      const n = Number(s);
      if (!Number.isInteger(n) || n < 0 || n > max) {
        ctx.addIssue({ code: "custom", message: `${label} looks wrong` });
        return z.NEVER;
      }
      return n;
    });

const optionalText = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s));

const optionalIsoDate = optionalText.refine(
  (s) => s === null || /^\d{4}-\d{2}-\d{2}$/.test(s),
  "Pick a date or leave it blank",
);

const optionalTime = optionalText.refine(
  (s) => s === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(s),
  "Curfew must be a time like 23:00",
);

/** The tri-state that "have we asked?" actually is. */
const availability = z
  .enum(["unknown", "yes", "no"])
  .transform((v) => (v === "unknown" ? null : v === "yes"));

const venueSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  status: z.enum(["considering", "shortlisted", "booked", "ruled_out"]),
  locality: optionalText,
  address: optionalText,
  url: optionalText,
  seatedCapacity: optionalCount("Seated capacity", 2000),
  standingCapacity: optionalCount("Standing capacity", 5000),
  hireFixedCostCents: dollars,
  // Blank means they quote no per-head rate, and the comparison prices an
  // outside caterer instead. Zero would mean the dinner is free.
  perHeadCostCents: optionalDollars,
  perChildCostCents: optionalDollars,
  minimumSpendCents: optionalDollars,
  dateAvailable: availability,
  travelMinutes: optionalCount("Travel time", 1440),
  curfew: optionalTime,
  siteVisitDate: optionalIsoDate,
  hireIncludes: optionalText,
  notes: optionalText,
});

function parseVenue(formData: FormData) {
  return venueSchema.safeParse({
    name: formData.get("name"),
    status: formData.get("status"),
    locality: formData.get("locality"),
    address: formData.get("address"),
    url: formData.get("url"),
    seatedCapacity: formData.get("seatedCapacity"),
    standingCapacity: formData.get("standingCapacity"),
    hireFixedCostCents: formData.get("hireFixed"),
    perHeadCostCents: formData.get("perHead"),
    perChildCostCents: formData.get("perChild"),
    minimumSpendCents: formData.get("minimumSpend"),
    dateAvailable: formData.get("dateAvailable"),
    travelMinutes: formData.get("travelMinutes"),
    curfew: formData.get("curfew"),
    siteVisitDate: formData.get("siteVisitDate"),
    hireIncludes: formData.get("hireIncludes"),
    notes: formData.get("notes"),
  });
}

function revalidateVenues() {
  revalidatePath("/admin/venues");
  revalidatePath("/admin");
}

export async function createVenue(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseVenue(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.insert(venues).values(parsed.data);
  revalidateVenues();
  return { status: "success" };
}

export async function updateVenue(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Missing venue id" };

  const parsed = parseVenue(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.update(venues).set(parsed.data).where(eq(venues.id, id.data));
  revalidateVenues();
  return { status: "success" };
}

/**
 * Venues own nothing else - no scenario, no payment and no invitation
 * points at one - so deleting is just a delete.
 */
export async function deleteVenue(id: number): Promise<void> {
  await db.delete(venues).where(eq(venues.id, id));
  revalidateVenues();
}
