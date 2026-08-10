"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  runSheetItemRecipients,
  runSheetItems,
  runSheetRecipients,
} from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";

function revalidateRunSheet() {
  revalidatePath("/run-sheet");
}

const timeOfDay = z
  .string()
  .trim()
  .refine((s) => /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s), "Use a time like 14:30");

const optionalTimeOfDay = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s))
  .refine(
    (s) => s === null || /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s),
    "Use a time like 14:30, or leave it blank",
  );

const optionalText = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s));

const itemSchema = z
  .object({
    startTime: timeOfDay,
    endTime: optionalTimeOfDay,
    title: z.string().trim().min(1, "Say what happens"),
    detail: optionalText,
    location: optionalText,
    lead: optionalText,
    recipientIds: z.array(z.coerce.number().int().positive()),
  })
  .refine(
    (item) => item.endTime === null || item.endTime >= item.startTime,
    { message: "It cannot finish before it starts", path: ["endTime"] },
  );

function parseItem(formData: FormData) {
  return itemSchema.safeParse({
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime") ?? "",
    title: formData.get("title"),
    detail: formData.get("detail") ?? "",
    location: formData.get("location") ?? "",
    lead: formData.get("lead") ?? "",
    recipientIds: formData.getAll("recipientIds"),
  });
}

export async function createRunSheetItem(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseItem(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  const { recipientIds, ...item } = parsed.data;

  await db.transaction(async (tx) => {
    const [created] = await tx.insert(runSheetItems).values(item).returning();
    if (recipientIds.length > 0) {
      await tx.insert(runSheetItemRecipients).values(
        recipientIds.map((recipientId) => ({
          itemId: created.id,
          recipientId,
        })),
      );
    }
  });

  revalidateRunSheet();
  return { status: "success" };
}

export async function updateRunSheetItem(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Missing item id" };

  const parsed = parseItem(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  const { recipientIds, ...item } = parsed.data;

  await db.transaction(async (tx) => {
    await tx.update(runSheetItems).set(item).where(eq(runSheetItems.id, id.data));
    // Replace the recipient set wholesale so unticking really removes it.
    await tx
      .delete(runSheetItemRecipients)
      .where(eq(runSheetItemRecipients.itemId, id.data));
    if (recipientIds.length > 0) {
      await tx.insert(runSheetItemRecipients).values(
        recipientIds.map((recipientId) => ({
          itemId: id.data,
          recipientId,
        })),
      );
    }
  });

  revalidateRunSheet();
  return { status: "success" };
}

export async function deleteRunSheetItem(id: number): Promise<void> {
  await db.delete(runSheetItems).where(eq(runSheetItems.id, id));
  revalidateRunSheet();
}

/* ------------------------------------------------------------- recipients */

const recipientSchema = z.object({
  name: z.string().trim().min(1, "Who is it going to?"),
  role: z.string().trim().min(1, "What are they to the day?"),
  notes: optionalText,
  sortOrder: z.coerce.number().int().min(0).max(99),
});

function parseRecipient(formData: FormData) {
  return recipientSchema.safeParse({
    name: formData.get("name"),
    role: formData.get("role"),
    notes: formData.get("notes") ?? "",
    sortOrder: formData.get("sortOrder") ?? "0",
  });
}

export async function createRecipient(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseRecipient(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.insert(runSheetRecipients).values(parsed.data);
  revalidateRunSheet();
  return { status: "success" };
}

export async function updateRecipient(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Missing recipient id" };

  const parsed = parseRecipient(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db
    .update(runSheetRecipients)
    .set(parsed.data)
    .where(eq(runSheetRecipients.id, id.data));
  revalidateRunSheet();
  return { status: "success" };
}

export async function deleteRecipient(id: number): Promise<void> {
  await db.delete(runSheetRecipients).where(eq(runSheetRecipients.id, id));
  revalidateRunSheet();
}
