"use server";

import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { faqItems, households, publicSite } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { newInviteToken } from "@/lib/invite-token";
import { requireAdmin } from "@/lib/auth/session";

/**
 * The couple's side of the public invitation. All of this sits behind
 * the sign-in, under /admin; nothing here is reachable from /i.
 */

/** Mint links for every household that has none. Safe to press twice. */
export async function mintMissingLinks(): Promise<ActionResult> {
  await requireAdmin();

  const missing = await db
    .select({ id: households.id })
    .from(households)
    .where(isNull(households.inviteToken));

  for (const household of missing) {
    await db
      .update(households)
      .set({ inviteToken: newInviteToken() })
      .where(eq(households.id, household.id));
  }

  revalidatePath("/admin/invitations");
  return { status: "success" };
}

/**
 * Give one household a link, or a new one.
 *
 * Reissuing matters more than it looks: the link *is* the credential,
 * and links get forwarded. If one ends up somewhere it should not there
 * is no password to change - replacing the token is the only remedy,
 * and it kills the old link the instant this runs.
 */
export async function mintLink(householdId: number): Promise<ActionResult> {
  await requireAdmin();

  const updated = await db
    .update(households)
    .set({ inviteToken: newInviteToken() })
    .where(eq(households.id, householdId))
    .returning({ id: households.id });
  if (updated.length === 0) {
    return { status: "error", message: "No such household" };
  }
  revalidatePath("/admin/invitations");
  return { status: "success" };
}

export async function setPublished(published: boolean): Promise<ActionResult> {
  await requireAdmin();

  await db
    .insert(publicSite)
    .values({ id: 1, published })
    .onConflictDoUpdate({ target: publicSite.id, set: { published } });
  revalidatePath("/admin/invitations");
  revalidatePath("/admin/invitations/content");
  // The switch that decides whether the guests' landing page exists.
  revalidatePath("/");
  return { status: "success" };
}

const contentSchema = z.object({
  welcomeMessage: optional(2000),
  venueName: optional(200),
  venueAddress: optional(300),
  venueMapUrl: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine(
      (value) => value === null || /^https?:\/\//i.test(value),
      "The map link needs to start with http:// or https://",
    ),
  arrivalTime: timeOrNull(),
  ceremonyTime: timeOrNull(),
  dressCode: optional(200),
  giftNote: optional(2000),
  travelNotes: optional(4000),
  accommodationNotes: optional(4000),
  rsvpDeadline: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine(
      (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
      "The reply-by date must be a real date",
    ),
  photosEnabled: z.boolean(),
  tableRevealEnabled: z.boolean(),
});

function optional(max: number) {
  return z
    .string()
    .max(max)
    .trim()
    .transform((value) => (value === "" ? null : value));
}

function timeOrNull() {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine(
      (value) => value === null || /^\d{2}:\d{2}(:\d{2})?$/.test(value),
      "Times look like 14:00",
    );
}

export async function updateSiteContent(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const text = (name: string) => String(formData.get(name) ?? "");
  const parsed = contentSchema.safeParse({
    welcomeMessage: text("welcomeMessage"),
    venueName: text("venueName"),
    venueAddress: text("venueAddress"),
    venueMapUrl: text("venueMapUrl"),
    arrivalTime: text("arrivalTime"),
    ceremonyTime: text("ceremonyTime"),
    dressCode: text("dressCode"),
    giftNote: text("giftNote"),
    travelNotes: text("travelNotes"),
    accommodationNotes: text("accommodationNotes"),
    rsvpDeadline: text("rsvpDeadline"),
    photosEnabled: formData.get("photosEnabled") === "on",
    tableRevealEnabled: formData.get("tableRevealEnabled") === "on",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  await db
    .insert(publicSite)
    .values({ id: 1, ...parsed.data })
    .onConflictDoUpdate({ target: publicSite.id, set: parsed.data });

  revalidatePath("/admin/invitations/content");
  // The venue's town appears on the landing page.
  revalidatePath("/");
  return { status: "success" };
}

const faqSchema = z.object({
  question: z.string().trim().min(1, "A question is required").max(300),
  answer: z.string().trim().min(1, "An answer is required").max(2000),
  sortOrder: z.coerce.number().int().min(0).max(999),
});

export async function saveFaq(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = faqSchema.safeParse({
    question: formData.get("question") ?? "",
    answer: formData.get("answer") ?? "",
    sortOrder: formData.get("sortOrder") ?? "0",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const id = Number(formData.get("id"));
  if (Number.isSafeInteger(id) && id > 0) {
    await db.update(faqItems).set(parsed.data).where(eq(faqItems.id, id));
  } else {
    await db.insert(faqItems).values(parsed.data);
  }

  revalidatePath("/admin/invitations/content");
  return { status: "success" };
}

export async function deleteFaq(id: number): Promise<ActionResult> {
  await requireAdmin();

  await db.delete(faqItems).where(eq(faqItems.id, id));
  revalidatePath("/admin/invitations/content");
  return { status: "success" };
}
