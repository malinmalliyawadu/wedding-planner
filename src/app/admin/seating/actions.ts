"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { guests, seatingConstraints } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";

function revalidateSeating() {
  revalidatePath("/admin/seating");
  revalidatePath("/admin/tables");
  revalidatePath("/admin/guests");
  revalidatePath("/admin");
}

const arrangementSchema = z.array(
  z.object({
    guestId: z.number().int().positive(),
    tableId: z.number().int().positive().nullable(),
    pinned: z.boolean(),
  }),
);

/**
 * Write a whole arrangement back: where everyone sits and who is pinned.
 * A wedding is a few hundred guests at most, so a row apiece inside one
 * transaction is fast and stays legible.
 */
export async function saveArrangement(
  entries: Array<{ guestId: number; tableId: number | null; pinned: boolean }>,
): Promise<ActionResult> {
  const parsed = arrangementSchema.safeParse(entries);
  if (!parsed.success) {
    return { status: "error", message: "That arrangement could not be read" };
  }
  if (parsed.data.length === 0) return { status: "success" };

  await db.transaction(async (tx) => {
    for (const entry of parsed.data) {
      await tx
        .update(guests)
        .set({ tableId: entry.tableId, pinned: entry.pinned })
        .where(eq(guests.id, entry.guestId));
    }
  });

  revalidateSeating();
  return { status: "success" };
}

/** Put everyone back in the pool and let the solver have the room. */
export async function clearSeating(): Promise<void> {
  await db.update(guests).set({ tableId: null, pinned: false });
  revalidateSeating();
}

/* ------------------------------------------------------------ constraints */

const constraintSchema = z
  .object({
    guestAId: z.coerce.number().int().positive("Choose the first guest"),
    guestBId: z.coerce.number().int().positive("Choose the second guest"),
    kind: z.enum(["together", "apart"]),
    weight: z.coerce
      .number()
      .int()
      .min(1, "Strength runs 1 to 10")
      .max(10, "Strength runs 1 to 10"),
  })
  .refine((c) => c.guestAId !== c.guestBId, {
    message: "Pick two different guests",
  });

export async function createSeatingConstraint(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = constraintSchema.safeParse({
    guestAId: formData.get("guestAId"),
    guestBId: formData.get("guestBId"),
    kind: formData.get("kind"),
    weight: formData.get("weight"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.insert(seatingConstraints).values(parsed.data);
  revalidateSeating();
  return { status: "success" };
}

export async function deleteSeatingConstraint(id: number): Promise<void> {
  await db.delete(seatingConstraints).where(eq(seatingConstraints.id, id));
  revalidateSeating();
}
