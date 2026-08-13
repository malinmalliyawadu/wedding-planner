"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { guests, households } from "@/db/schema";
import {
  guestNameKey,
  importableRows,
  parseGuestCsv,
  type ParseResult,
} from "@/lib/guest-csv";

async function existingNameKeys(): Promise<Set<string>> {
  const all = await db
    .select({ first: guests.firstName, last: guests.lastName })
    .from(guests);
  return new Set(all.map((g) => guestNameKey(g.first, g.last)));
}

export async function previewGuestCsv(csvText: string): Promise<ParseResult> {
  return parseGuestCsv(csvText, await existingNameKeys());
}

export type CommitResult = {
  imported: number;
  households: number;
  skipped: number;
};

/**
 * Re-parses the CSV server-side (never trusting a client-built structure)
 * and inserts the importable rows. Households are matched by name,
 * case-insensitively, and created when missing.
 */
export async function commitGuestCsv(csvText: string): Promise<CommitResult> {
  const result = parseGuestCsv(csvText, await existingNameKeys());
  if (result.fileError) {
    return { imported: 0, households: 0, skipped: result.rows.length };
  }
  const rows = importableRows(result);

  const existingHouseholds = await db.select().from(households);
  const householdIdByName = new Map(
    existingHouseholds.map((h) => [h.name.trim().toLowerCase(), h.id]),
  );

  let createdHouseholds = 0;
  for (const row of rows) {
    const key = row.household.trim().toLowerCase();
    let householdId = householdIdByName.get(key);
    if (householdId === undefined) {
      const [created] = await db
        .insert(households)
        .values({ name: row.household })
        .returning();
      householdId = created.id;
      householdIdByName.set(key, householdId);
      createdHouseholds++;
    }
    await db.insert(guests).values({
      householdId,
      firstName: row.firstName,
      lastName: row.lastName,
      side: row.side,
      ageBracket: row.ageBracket,
      dietaryNotes: row.dietaryNotes,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/guests");
  revalidatePath("/admin/households");

  return {
    imported: rows.length,
    households: createdHouseholds,
    skipped: result.rows.length - rows.length,
  };
}
