"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { generateTimeline } from "@/lib/timeline";
import { getSettings } from "@/lib/queries";

function revalidateTimeline() {
  revalidatePath("/admin/timeline");
  revalidatePath("/admin");
}

const taskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title"),
  dueDate: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s))
    .refine(
      (s) => s === null || /^\d{4}-\d{2}-\d{2}$/.test(s),
      "Pick a date or leave it blank",
    ),
  owner: z.enum(["a", "b", "both"]),
  category: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s)),
  notes: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s)),
  /** Editing a placeholder date is how you confirm it. */
  needsConfirmation: z.boolean(),
});

function parseTask(formData: FormData) {
  return taskSchema.safeParse({
    title: formData.get("title"),
    dueDate: formData.get("dueDate") ?? "",
    owner: formData.get("owner"),
    category: formData.get("category") ?? "",
    notes: formData.get("notes") ?? "",
    needsConfirmation: formData.get("needsConfirmation") === "on",
  });
}

export async function createTask(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseTask(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.insert(tasks).values(parsed.data);
  revalidateTimeline();
  return { status: "success" };
}

export async function updateTask(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Missing task id" };

  const parsed = parseTask(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.update(tasks).set(parsed.data).where(eq(tasks.id, id.data));
  revalidateTimeline();
  return { status: "success" };
}

export async function deleteTask(id: number): Promise<void> {
  await db.delete(tasks).where(eq(tasks.id, id));
  revalidateTimeline();
}

export async function setTaskDone(id: number, done: boolean): Promise<void> {
  await db.update(tasks).set({ done }).where(eq(tasks.id, id));
  revalidateTimeline();
}

export type GenerateResult = {
  added: number;
  skipped: number;
};

/**
 * Fill in the backwards-planned plan from the wedding date. Only tasks
 * that are not already on the list are added, so this is safe to run
 * again after you have edited things.
 */
export async function generateFromWeddingDate(): Promise<GenerateResult> {
  const settings = await getSettings();
  if (settings.weddingDate === null) return { added: 0, skipped: 0 };

  const existing = await db.select({ title: tasks.title }).from(tasks);
  const drafts = generateTimeline(
    settings.weddingDate,
    new Set(existing.map((t) => t.title)),
  );

  if (drafts.length > 0) {
    await db.insert(tasks).values(
      drafts.map((draft) => ({
        title: draft.title,
        dueDate: draft.dueDate,
        owner: draft.owner,
        category: draft.category,
        notes: draft.note ?? null,
        needsConfirmation: draft.needsConfirmation ?? false,
        done: false,
      })),
    );
  }

  revalidateTimeline();
  return {
    added: drafts.length,
    skipped: existing.length,
  };
}
