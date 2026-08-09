import Papa from "papaparse";

/**
 * Canonical guest import format. Header row required:
 *
 *   household,first_name,last_name,side,age_bracket,dietary_notes
 *
 * - Consecutive rows sharing a household value belong to one household;
 *   households are matched to existing ones by name, case-insensitively.
 * - side: a | b | both (blank = both)
 * - age_bracket: adult | child | infant (blank = adult)
 * - Rows whose first+last name already exist (in the DB or earlier in the
 *   file) are reported as duplicates and skipped on commit.
 */

export const CSV_HEADERS = [
  "household",
  "first_name",
  "last_name",
  "side",
  "age_bracket",
  "dietary_notes",
] as const;

export type ParsedGuestRow = {
  line: number;
  household: string;
  firstName: string;
  lastName: string;
  side: "a" | "b" | "both";
  ageBracket: "adult" | "child" | "infant";
  dietaryNotes: string | null;
  /** Non-null when the row cannot be imported. */
  error: string | null;
  /** True when the guest already exists and the row will be skipped. */
  duplicate: boolean;
};

export type ParseResult = {
  rows: ParsedGuestRow[];
  /** Fatal problem with the file as a whole (bad/missing header). */
  fileError: string | null;
};

const SIDES = new Set(["a", "b", "both"]);
const AGE_BRACKETS = new Set(["adult", "child", "infant"]);

export function parseGuestCsv(
  csvText: string,
  existingGuestNames: ReadonlySet<string>,
): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  const headers = parsed.meta.fields ?? [];
  const missing = ["household", "first_name", "last_name"].filter(
    (h) => !headers.includes(h),
  );
  if (missing.length > 0) {
    return {
      rows: [],
      fileError: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Expected header: ${CSV_HEADERS.join(",")}`,
    };
  }

  const seenInFile = new Set<string>();
  const rows: ParsedGuestRow[] = parsed.data.map((raw, i) => {
    const get = (key: string) => (raw[key] ?? "").trim();
    const row: ParsedGuestRow = {
      line: i + 2, // 1-based, after the header row
      household: get("household"),
      firstName: get("first_name"),
      lastName: get("last_name"),
      side: "both",
      ageBracket: "adult",
      dietaryNotes: get("dietary_notes") || null,
      error: null,
      duplicate: false,
    };

    const problems: string[] = [];
    if (!row.household) problems.push("household is blank");
    if (!row.firstName) problems.push("first_name is blank");
    if (!row.lastName) problems.push("last_name is blank");

    const side = get("side").toLowerCase();
    if (side && !SIDES.has(side)) {
      problems.push(`side "${get("side")}" is not a, b or both`);
    } else if (side) {
      row.side = side as ParsedGuestRow["side"];
    }

    const age = get("age_bracket").toLowerCase();
    if (age && !AGE_BRACKETS.has(age)) {
      problems.push(`age_bracket "${get("age_bracket")}" is not adult, child or infant`);
    } else if (age) {
      row.ageBracket = age as ParsedGuestRow["ageBracket"];
    }

    if (problems.length > 0) {
      row.error = problems.join("; ");
      return row;
    }

    const nameKey = guestNameKey(row.firstName, row.lastName);
    if (existingGuestNames.has(nameKey) || seenInFile.has(nameKey)) {
      row.duplicate = true;
    }
    seenInFile.add(nameKey);
    return row;
  });

  return { rows, fileError: null };
}

export function guestNameKey(firstName: string, lastName: string): string {
  return `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}`;
}

/** Rows that will actually be inserted on commit. */
export function importableRows(result: ParseResult): ParsedGuestRow[] {
  return result.rows.filter((r) => !r.error && !r.duplicate);
}
