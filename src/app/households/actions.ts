"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { households } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";

const householdSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  address: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s)),
  inviteStage: z.enum(["not_invited", "save_the_date", "invited", "confirmed"]),
  notes: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s)),
});

function parseHouseholdForm(formData: FormData) {
  return householdSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") ?? "",
    inviteStage: formData.get("inviteStage"),
    notes: formData.get("notes") ?? "",
  });
}

function revalidateHouseholdPages() {
  revalidatePath("/");
  revalidatePath("/guests");
  revalidatePath("/households");
}

export async function createHousehold(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseHouseholdForm(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.insert(households).values(parsed.data);
  revalidateHouseholdPages();
  return { status: "success" };
}

export async function updateHousehold(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Missing household id" };

  const parsed = parseHouseholdForm(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db
    .update(households)
    .set(parsed.data)
    .where(eq(households.id, id.data));
  revalidateHouseholdPages();
  return { status: "success" };
}

/** Deleting a household cascades to its guests (FK on delete cascade). */
export async function deleteHousehold(id: number): Promise<void> {
  await db.delete(households).where(eq(households.id, id));
  revalidateHouseholdPages();
  revalidatePath("/tables");
}
