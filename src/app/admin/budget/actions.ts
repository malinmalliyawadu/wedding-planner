"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  budgetItems,
  itemOptions,
  scenarioChoices,
  scenarios,
} from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { parseDollarsToCents } from "@/lib/money";

/** Dollar strings from a form become integer cents, or a validation error. */
const dollarsToCents = z
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

/** Blank means "charge children at the adult rate", stored as null. */
const optionalDollarsToCents = z
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

const priority = z.coerce
  .number()
  .int()
  .min(1, "Priority runs 1 to 5")
  .max(5, "Priority runs 1 to 5");

function revalidateBudget() {
  revalidatePath("/admin/budget");
  revalidatePath("/admin/budget/scenarios");
  revalidatePath("/admin/budget/compromise");
}

/* ----------------------------------------------------------- budget items */

const budgetItemSchema = z.object({
  category: z.string().trim().min(1, "Category is required"),
  name: z.string().trim().min(1, "Name is required"),
  fixedCostCents: dollarsToCents,
  perHeadCostCents: dollarsToCents,
  perChildCostCents: optionalDollarsToCents,
  priorityA: priority,
  priorityB: priority,
  notes: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s)),
});

function parseBudgetItemForm(formData: FormData) {
  return budgetItemSchema.safeParse({
    category: formData.get("category"),
    name: formData.get("name"),
    fixedCostCents: formData.get("fixedCost") ?? "0",
    perHeadCostCents: formData.get("perHeadCost") ?? "0",
    perChildCostCents: formData.get("perChildCost") ?? "",
    priorityA: formData.get("priorityA"),
    priorityB: formData.get("priorityB"),
    notes: formData.get("notes") ?? "",
  });
}

export async function createBudgetItem(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseBudgetItemForm(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.insert(budgetItems).values(parsed.data);
  revalidateBudget();
  return { status: "success" };
}

export async function updateBudgetItem(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Missing item id" };

  const parsed = parseBudgetItemForm(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db
    .update(budgetItems)
    .set(parsed.data)
    .where(eq(budgetItems.id, id.data));
  revalidateBudget();
  return { status: "success" };
}

/** Deleting an item cascades to its tiers, scenario choices and payments. */
export async function deleteBudgetItem(id: number): Promise<void> {
  await db.delete(budgetItems).where(eq(budgetItems.id, id));
  revalidateBudget();
}

/* ------------------------------------------------------------------ tiers */

const itemOptionSchema = z.object({
  budgetItemId: z.coerce.number().int().positive(),
  label: z.string().trim().min(1, "Label is required"),
  fixedCostCents: dollarsToCents,
  perHeadCostCents: dollarsToCents,
  perChildCostCents: optionalDollarsToCents,
  sortOrder: z.coerce.number().int().min(0).max(99),
});

export async function createItemOption(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = itemOptionSchema.safeParse({
    budgetItemId: formData.get("budgetItemId"),
    label: formData.get("label"),
    fixedCostCents: formData.get("fixedCost") ?? "0",
    perHeadCostCents: formData.get("perHeadCost") ?? "0",
    perChildCostCents: formData.get("perChildCost") ?? "",
    sortOrder: formData.get("sortOrder") ?? "0",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.insert(itemOptions).values(parsed.data);
  revalidateBudget();
  return { status: "success" };
}

export async function updateItemOption(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Missing tier id" };

  const parsed = itemOptionSchema.safeParse({
    budgetItemId: formData.get("budgetItemId"),
    label: formData.get("label"),
    fixedCostCents: formData.get("fixedCost") ?? "0",
    perHeadCostCents: formData.get("perHeadCost") ?? "0",
    perChildCostCents: formData.get("perChildCost") ?? "",
    sortOrder: formData.get("sortOrder") ?? "0",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.update(itemOptions).set(parsed.data).where(eq(itemOptions.id, id.data));
  revalidateBudget();
  return { status: "success" };
}

/** Scenarios pointing at this tier fall back to the item's base costs. */
export async function deleteItemOption(id: number): Promise<void> {
  await db.delete(itemOptions).where(eq(itemOptions.id, id));
  revalidateBudget();
}

/* -------------------------------------------------------------- scenarios */

const choiceSchema = z.object({
  budgetItemId: z.number().int().positive(),
  itemOptionId: z.number().int().positive().nullable(),
  excluded: z.boolean(),
});

const saveScenarioSchema = z.object({
  id: z.number().int().positive().nullable(),
  name: z.string().trim().min(1, "Give the scenario a name"),
  adultCount: z.number().int().min(0).max(1000),
  childCount: z.number().int().min(0).max(1000),
  notes: z.string().trim().nullable(),
  choices: z.array(choiceSchema),
});

export type SaveScenarioInput = z.input<typeof saveScenarioSchema>;

/**
 * Save the current modeller state as a named scenario. Passing an id
 * overwrites that scenario; passing null creates a new one. Choices are
 * replaced wholesale so a removed override really disappears.
 */
export async function saveScenario(
  input: SaveScenarioInput,
): Promise<ActionResult & { scenarioId?: number }> {
  const parsed = saveScenarioSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  const { id, name, adultCount, childCount, notes, choices } = parsed.data;

  const scenarioId = await db.transaction(async (tx) => {
    let targetId: number;
    if (id === null) {
      const [created] = await tx
        .insert(scenarios)
        .values({ name, adultCount, childCount, notes })
        .returning();
      targetId = created.id;
    } else {
      await tx
        .update(scenarios)
        .set({ name, adultCount, childCount, notes })
        .where(eq(scenarios.id, id));
      await tx
        .delete(scenarioChoices)
        .where(eq(scenarioChoices.scenarioId, id));
      targetId = id;
    }

    // Only overrides are stored; an item at base costs has no row.
    const rows = choices
      .filter((c) => c.excluded || c.itemOptionId !== null)
      .map((c) => ({ ...c, scenarioId: targetId }));
    if (rows.length > 0) await tx.insert(scenarioChoices).values(rows);

    return targetId;
  });

  revalidateBudget();
  return { status: "success", scenarioId };
}

export async function deleteScenario(id: number): Promise<void> {
  await db.delete(scenarios).where(eq(scenarios.id, id));
  revalidateBudget();
}
