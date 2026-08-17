"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { tables } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/lib/auth/session";

const tableSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  capacity: z.coerce
    .number()
    .int("Capacity must be a whole number")
    .min(1, "Capacity must be at least 1")
    .max(100, "Capacity looks too large"),
});

function revalidateTablePages() {
  revalidatePath("/admin");
  revalidatePath("/admin/guests");
  revalidatePath("/admin/tables");
}

export async function createTable(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = tableSchema.safeParse({
    name: formData.get("name"),
    capacity: formData.get("capacity"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.insert(tables).values(parsed.data);
  revalidateTablePages();
  return { status: "success" };
}

export async function updateTable(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Missing table id" };

  const parsed = tableSchema.safeParse({
    name: formData.get("name"),
    capacity: formData.get("capacity"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.update(tables).set(parsed.data).where(eq(tables.id, id.data));
  revalidateTablePages();
  return { status: "success" };
}

/** Guests seated at the table are unseated (FK on delete set null). */
export async function deleteTable(id: number): Promise<void> {
  await requireAdmin();

  await db.delete(tables).where(eq(tables.id, id));
  revalidateTablePages();
}
