"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { venues } from "@/db/schema";
import {
  importableVenueRows,
  parseVenueCsv,
  venueNameKey,
  type VenueParseResult,
} from "@/lib/venue-csv";

async function existingNameKeys(): Promise<Set<string>> {
  const all = await db.select({ name: venues.name }).from(venues);
  return new Set(all.map((v) => venueNameKey(v.name)));
}

export async function previewVenueCsv(
  csvText: string,
): Promise<VenueParseResult> {
  return parseVenueCsv(csvText, await existingNameKeys());
}

export type VenueCommitResult = {
  imported: number;
  skipped: number;
  /** Imported venues with no hire fee, which are blocked until you ask. */
  unquoted: number;
};

/**
 * Re-parses the CSV server-side - never trusting a structure the client
 * built - and inserts the importable rows. A venue whose name is already
 * on the list is skipped rather than merged, so importing twice is safe
 * and a row you have since edited by hand is never overwritten by the
 * spreadsheet it came from.
 */
export async function commitVenueCsv(
  csvText: string,
): Promise<VenueCommitResult> {
  const result = await previewVenueCsv(csvText);
  if (result.fileError !== null) {
    return { imported: 0, skipped: result.rows.length, unquoted: 0 };
  }

  const rows = importableVenueRows(result);
  if (rows.length > 0) {
    await db.insert(venues).values(rows.map((row) => row.values));
  }

  revalidatePath("/admin/venues");
  revalidatePath("/admin");

  return {
    imported: rows.length,
    skipped: result.rows.length - rows.length,
    unquoted: rows.filter((r) => r.values.hireFixedCostCents === null).length,
  };
}
