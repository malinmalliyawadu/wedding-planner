"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { guests } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/lib/auth/session";

const guestSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  householdId: z.coerce.number().int().positive("Choose a household"),
  side: z.enum(["a", "b", "both"]),
  ageBracket: z.enum(["adult", "child", "infant"]),
  rsvpStatus: z.enum(["pending", "attending", "declined"]),
  dietaryNotes: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s)),
  tableId: z
    .string()
    .transform((s) => (s === "" ? null : parseInt(s, 10)))
    .pipe(z.number().int().positive().nullable()),
});

function parseGuestForm(formData: FormData) {
  return guestSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    householdId: formData.get("householdId"),
    side: formData.get("side"),
    ageBracket: formData.get("ageBracket"),
    rsvpStatus: formData.get("rsvpStatus"),
    dietaryNotes: formData.get("dietaryNotes") ?? "",
    tableId: (formData.get("tableId") as string) ?? "",
  });
}

function revalidateGuestPages() {
  revalidatePath("/admin");
  revalidatePath("/admin/guests");
  revalidatePath("/admin/households");
  revalidatePath("/admin/tables");
}

export async function createGuest(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = parseGuestForm(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.insert(guests).values(parsed.data);
  revalidateGuestPages();
  return { status: "success" };
}

export async function updateGuest(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Missing guest id" };

  const parsed = parseGuestForm(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.update(guests).set(parsed.data).where(eq(guests.id, id.data));
  revalidateGuestPages();
  return { status: "success" };
}

export async function deleteGuest(id: number): Promise<void> {
  await requireAdmin();

  await db.delete(guests).where(eq(guests.id, id));
  revalidateGuestPages();
}
