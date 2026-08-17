"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { contributions, payments } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { parseDollarsToCents } from "@/lib/money";
import { todayNZ } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth/session";

const dollars = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const cents = parseDollarsToCents(s);
    if (cents === null || cents <= 0) {
      ctx.addIssue({
        code: "custom",
        message: `"${s}" is not a positive dollar amount`,
      });
      return z.NEVER;
    }
    return cents;
  });

const isoDate = z
  .string()
  .trim()
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s), "Pick a date");

const optionalIsoDate = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s))
  .refine(
    (s) => s === null || /^\d{4}-\d{2}-\d{2}$/.test(s),
    "Pick a date or leave it blank",
  );

function revalidateSavings() {
  revalidatePath("/admin/savings");
  revalidatePath("/admin");
}

/* ---------------------------------------------------------- contributions */

const contributionSchema = z.object({
  date: isoDate,
  amountCents: dollars,
  source: z.string().trim().min(1, "Say where it came from"),
  notes: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s)),
});

function parseContribution(formData: FormData) {
  return contributionSchema.safeParse({
    date: formData.get("date"),
    amountCents: formData.get("amount"),
    source: formData.get("source"),
    notes: formData.get("notes") ?? "",
  });
}

export async function createContribution(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = parseContribution(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.insert(contributions).values(parsed.data);
  revalidateSavings();
  return { status: "success" };
}

export async function updateContribution(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Missing contribution id" };

  const parsed = parseContribution(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db
    .update(contributions)
    .set(parsed.data)
    .where(eq(contributions.id, id.data));
  revalidateSavings();
  return { status: "success" };
}

export async function deleteContribution(id: number): Promise<void> {
  await requireAdmin();

  await db.delete(contributions).where(eq(contributions.id, id));
  revalidateSavings();
}

/* --------------------------------------------------------------- payments */

const paymentSchema = z.object({
  budgetItemId: z.coerce.number().int().positive("Choose what this pays for"),
  amountCents: dollars,
  dueDate: isoDate,
  paidDate: optionalIsoDate,
  notes: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s)),
});

function parsePayment(formData: FormData) {
  return paymentSchema.safeParse({
    budgetItemId: formData.get("budgetItemId"),
    amountCents: formData.get("amount"),
    dueDate: formData.get("dueDate"),
    paidDate: formData.get("paidDate") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export async function createPayment(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = parsePayment(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.insert(payments).values(parsed.data);
  revalidateSavings();
  return { status: "success" };
}

export async function updatePayment(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Missing payment id" };

  const parsed = parsePayment(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  await db.update(payments).set(parsed.data).where(eq(payments.id, id.data));
  revalidateSavings();
  return { status: "success" };
}

export async function deletePayment(id: number): Promise<void> {
  await requireAdmin();

  await db.delete(payments).where(eq(payments.id, id));
  revalidateSavings();
}

/** Tick a payment off, or put it back on the schedule. */
export async function setPaymentPaid(
  id: number,
  paid: boolean,
): Promise<void> {
  await requireAdmin();

  await db
    .update(payments)
    .set({ paidDate: paid ? todayNZ() : null })
    .where(eq(payments.id, id));
  revalidateSavings();
}
