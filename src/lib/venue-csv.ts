/**
 * Venue import. Pure: parsing only, integer NZD cents, no DB and no React.
 *
 * A venue shortlist is not typed into an app, it is researched in a
 * spreadsheet - so this reads the spreadsheet people actually have
 * rather than insisting on the one the app would prefer. Three
 * decisions carry that:
 *
 * 1. **Headers are matched by alias.** `Venue`, `Max seated`, `Venue
 *    hire (NZD)` and `Website` all land where they belong, so a file
 *    put together for the purpose imports without being reshaped first.
 *
 * 2. **Every column the arithmetic cannot use is kept verbatim in the
 *    notes**, under its own heading, in the order the file had them.
 *    A venue spreadsheet is mostly prose - catering policy, what is on
 *    site, how confident the price is - and prose is the part of this
 *    decision no column can settle. Dropping it silently would be the
 *    worst thing an importer could do to it. Travel and curfew are kept
 *    *as well as* parsed, because "115 min" loses that there is a
 *    flight in it and "23:00" loses that the outdoor music stops at
 *    nine.
 *
 * 3. **Nothing is inferred into a money column.** A cell reading `ask`
 *    imports as "nobody has asked", never as zero, and a catering
 *    figure the file itself marks as the researcher's own estimate is
 *    dropped rather than recorded as a quote - the comparison has its
 *    own assumed caterer rate and marks every total it touches. What
 *    goes in the database is what the venue said.
 *
 * The one derived number here is the per-head rate: a spreadsheet built
 * around a guest count quotes catering as a total for that many people
 * ("Catering est. (121 guests)"), so the count comes out of the header
 * and the total is divided back down. That is arithmetic on their
 * figure, not an opinion about it.
 */

import Papa from "papaparse";
import { parseDollarsToCents } from "./money";

/**
 * The canonical header, and what a file gets told to look like when it
 * has nothing recognisable in it. Everything here is optional but
 * `name`, and the aliases below mean a real research spreadsheet rarely
 * has to be rewritten into it.
 */
export const VENUE_CSV_HEADERS = [
  "name",
  "locality",
  "address",
  "url",
  "seated_capacity",
  "standing_capacity",
  "hire_cost",
  "per_head_cost",
  "per_child_cost",
  "minimum_spend",
  "travel_minutes",
  "curfew",
  "notes",
] as const;

/** The columns the arithmetic reads, and the header spellings for each. */
const ALIASES = {
  name: ["name", "venue", "venue_name", "place"],
  locality: ["locality", "location", "town", "suburb", "area"],
  address: ["address"],
  url: ["url", "website", "web", "link", "site"],
  seatedCapacity: [
    "seated_capacity",
    "seated",
    "max_seated",
    "seats",
    "capacity",
    "max_capacity",
  ],
  standingCapacity: ["standing_capacity", "standing", "max_standing"],
  hireCost: [
    "hire_cost",
    "hire",
    "hire_fee",
    "venue_hire",
    "venue_hire_nzd",
    "venue_hire_fee",
  ],
  perHeadCost: [
    "per_head_cost",
    "per_head",
    "per_adult",
    "per_adult_cost",
    "catering_per_head",
    "pp",
  ],
  perChildCost: ["per_child_cost", "per_child", "child_rate"],
  minimumSpend: ["minimum_spend", "minimum", "min_spend", "f_and_b_minimum"],
  travelMinutes: [
    "travel_minutes",
    "travel",
    "travel_time",
    "drive",
    "drive_time",
  ],
  curfew: ["curfew", "finish", "finish_time"],
  notes: ["notes", "note", "comments"],
} satisfies Record<string, readonly string[]>;

type Field = keyof typeof ALIASES;

const FIELD_BY_KEY = new Map<string, Field>(
  Object.entries(ALIASES).flatMap(([field, keys]) =>
    keys.map((key) => [key, field as Field] as const),
  ),
);

/**
 * A travel column names where you are travelling from - "Travel from
 * Wellington" - and the town is different for everyone, so this is a
 * prefix rather than another entry in the alias list.
 */
function fieldForKey(key: string): Field | undefined {
  return FIELD_BY_KEY.get(key) ?? (key.startsWith("travel_") ? "travelMinutes" : undefined);
}

/**
 * Columns that are consumed rather than kept: a total this importer
 * recomputes from its own guest count would sit in the notes
 * contradicting the number beside it, which is worse than not having
 * it. `catering_basis` is read (it decides whether the catering figure
 * is a quote) and then dropped for the same reason.
 */
const CONSUMED_KEYS = new Set([
  "catering_basis",
  "basis",
  "est_total",
  "estimated_total",
  "total",
  "per_guest",
  "cost_per_guest",
]);

/** What a cell says when the answer is "nobody knows yet". */
const UNKNOWN_CELLS = new Set([
  "",
  "-",
  "—",
  "–",
  "?",
  "ask",
  "asked",
  "tbc",
  "tba",
  "confirm",
  "unknown",
  "n/a",
  "na",
  "none",
  "not published",
  "not listed",
  "not known",
  "not asked",
]);

/** Everything an imported venue sets. The rest of the row keeps its defaults. */
export type VenueImportValues = {
  name: string;
  locality: string | null;
  address: string | null;
  url: string | null;
  seatedCapacity: number | null;
  standingCapacity: number | null;
  hireFixedCostCents: number | null;
  perHeadCostCents: number | null;
  perChildCostCents: number | null;
  minimumSpendCents: number | null;
  travelMinutes: number | null;
  curfew: string | null;
  notes: string | null;
};

export type ParsedVenueRow = {
  line: number;
  values: VenueImportValues;
  /**
   * What the importer did with a cell it could not take at face value.
   * Not errors: the row imports either way, but a hire fee that came
   * through blank because the file said "ask" is worth reading before
   * you press the button rather than wondering at it afterwards.
   */
  warnings: string[];
  /** Non-null when the row cannot be imported at all. */
  error: string | null;
  /** True when a venue of this name already exists, so the row is skipped. */
  duplicate: boolean;
};

export type VenueParseResult = {
  rows: ParsedVenueRow[];
  /** Fatal problem with the file as a whole. */
  fileError: string | null;
  /** Original labels of the columns folded into the notes, for the preview. */
  keptInNotes: string[];
  /**
   * The guest count a catering total was divided by, taken from the
   * column header. Null when no such column was found.
   */
  cateringGuestCount: number | null;
};

export function venueNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function parseVenueCsv(
  csvText: string,
  existingVenueNames: ReadonlySet<string>,
): VenueParseResult {
  const parsed = Papa.parse<string[]>(csvText.trim(), {
    header: false,
    skipEmptyLines: "greedy",
  });

  const [headerRow, ...dataRows] = parsed.data;
  const empty: Omit<VenueParseResult, "fileError"> = {
    rows: [],
    keptInNotes: [],
    cateringGuestCount: null,
  };
  if (headerRow === undefined) {
    return { ...empty, fileError: "That file has no rows in it." };
  }

  const columns = headerRow.map((label, index) => ({
    label: label.trim(),
    key: normaliseHeader(label),
    index,
  }));

  const fieldColumn = new Map<Field, number>();
  for (const column of columns) {
    const field = fieldForKey(column.key);
    // First spelling wins, so a file carrying both "venue" and "name"
    // does not have the later one quietly overwrite the earlier.
    if (field !== undefined && !fieldColumn.has(field)) {
      fieldColumn.set(field, column.index);
    }
  }

  if (!fieldColumn.has("name")) {
    return {
      ...empty,
      fileError: `No venue name column. Expected one called "name" or "venue"; the full header this understands is ${VENUE_CSV_HEADERS.join(",")}.`,
    };
  }

  const catering = findCateringColumn(columns);
  const mappedIndexes = new Set(fieldColumn.values());
  const notesColumn = fieldColumn.get("notes");

  // Everything the arithmetic does not consume, kept in file order and
  // under the file's own heading. Travel and curfew are deliberately
  // still in here despite being parsed: a duration loses the flight in
  // it, and a curfew time loses "outdoor music must stop at nine".
  const foldedColumns = columns.filter(
    (column) =>
      column.label !== "" &&
      column.index !== notesColumn &&
      column.index !== catering?.index &&
      !CONSUMED_KEYS.has(column.key) &&
      (!mappedIndexes.has(column.index) ||
        column.index === fieldColumn.get("travelMinutes") ||
        column.index === fieldColumn.get("curfew")),
  );

  const seenInFile = new Set<string>();
  const rows = dataRows.map((cells, i) =>
    parseRow({
      cells,
      line: i + 2, // 1-based, after the header row
      fieldColumn,
      foldedColumns,
      catering,
      existingVenueNames,
      seenInFile,
    }),
  );

  return {
    rows,
    fileError: null,
    keptInNotes: foldedColumns.map((c) => c.label),
    cateringGuestCount: catering?.guestCount ?? null,
  };
}

/** Rows that will actually be inserted on commit. */
export function importableVenueRows(
  result: VenueParseResult,
): ParsedVenueRow[] {
  return result.rows.filter((r) => !r.error && !r.duplicate);
}

/* ------------------------------------------------------------------ a row */

type Column = { label: string; key: string; index: number };
type CateringColumn = Column & {
  /** Heads the total covers, from the header. Null when it did not say. */
  guestCount: number | null;
  basisIndex: number | null;
};

function parseRow({
  cells,
  line,
  fieldColumn,
  foldedColumns,
  catering,
  existingVenueNames,
  seenInFile,
}: {
  cells: string[];
  line: number;
  fieldColumn: Map<Field, number>;
  foldedColumns: Column[];
  catering: CateringColumn | null;
  existingVenueNames: ReadonlySet<string>;
  seenInFile: Set<string>;
}): ParsedVenueRow {
  const cell = (field: Field): string => {
    const index = fieldColumn.get(field);
    return index === undefined ? "" : (cells[index] ?? "").trim();
  };

  const warnings: string[] = [];
  const problems: string[] = [];

  /** A money cell: unknown stays unknown, and a bad one stops the row. */
  const money = (
    field: Field,
    label: string,
    { quiet = false }: { quiet?: boolean } = {},
  ): number | null => {
    const raw = cell(field);
    if (isUnknown(raw)) {
      if (raw !== "" && !quiet) {
        warnings.push(`${label} left blank - the file says "${raw}"`);
      }
      return null;
    }
    const cents = parseDollarsToCents(raw);
    if (cents === null || cents < 0) {
      problems.push(`${label} "${raw}" is not a dollar amount`);
      return null;
    }
    return cents;
  };

  const count = (field: Field, label: string, max: number): number | null => {
    const raw = cell(field);
    if (isUnknown(raw)) return null;
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isInteger(n) || n <= 0 || n > max) {
      problems.push(`${label} "${raw}" is not a whole number of people`);
      return null;
    }
    return n;
  };

  const name = cell("name");
  if (name === "") problems.push("the venue has no name");

  const values: VenueImportValues = {
    name,
    locality: text(cell("locality")),
    address: text(cell("address")),
    url: text(cell("url")),
    seatedCapacity: count("seatedCapacity", "Seated capacity", 5000),
    standingCapacity: count("standingCapacity", "Standing capacity", 10_000),
    // Quiet, because the blocked-until-you-ask warning below says it
    // better and there is no sense saying it twice.
    hireFixedCostCents: money("hireCost", "Hire fee", { quiet: true }),
    perHeadCostCents: money("perHeadCost", "Per-head rate"),
    perChildCostCents: money("perChildCost", "Per-child rate"),
    minimumSpendCents: money("minimumSpend", "Minimum spend"),
    travelMinutes: parseTravelMinutes(cell("travelMinutes")),
    curfew: parseCurfew(cell("curfew")),
    notes: null,
  };

  // A catering total covering a stated number of heads divides back down
  // to a per-head rate - but only when the file says the figure came from
  // the venue. A researcher's own placeholder is not a quote, and the
  // comparison already has its own assumed caterer rate to price the gap
  // with, marked as assumed everywhere it appears.
  if (catering !== null && values.perHeadCostCents === null) {
    const raw = (cells[catering.index] ?? "").trim();
    const basis =
      catering.basisIndex === null
        ? ""
        : (cells[catering.basisIndex] ?? "").trim();
    const total = isUnknown(raw) ? null : parseDollarsToCents(raw);

    if (total !== null && total >= 0) {
      if (!isQuotedBasis(basis)) {
        warnings.push(
          `Catering left to the assumed caterer - the file calls its figure "${basis}"`,
        );
      } else if (catering.guestCount === null) {
        warnings.push(
          `Catering ignored - "${catering.label}" does not say how many guests it covers`,
        );
      } else {
        values.perHeadCostCents = Math.round(total / catering.guestCount);
        warnings.push(
          `Per-head rate worked back from ${catering.label} over ${catering.guestCount} guests`,
        );
      }
    }
  }

  if (values.hireFixedCostCents === null && fieldColumn.has("hireCost")) {
    warnings.push("No hire fee, so it will sit blocked until you ask for one");
  }
  const curfewCell = cell("curfew");
  if (values.curfew === null && !isUnknown(curfewCell)) {
    warnings.push("Curfew kept in the notes - it is not a single clear time");
  }
  const travelCell = cell("travelMinutes");
  if (values.travelMinutes === null && !isUnknown(travelCell)) {
    warnings.push("Travel kept in the notes - it is not a whole journey time");
  }

  // Travel and curfew are folded into the notes for what the number
  // loses - the flight, the outdoor-music rule. When the cell said only
  // the number, there is nothing left for it to lose, and repeating it
  // under a heading would be noise.
  const saidOnlyTheNumber = new Set<number>();
  const addIfNothingLost = (field: Field, parsed: string | null): void => {
    const index = fieldColumn.get(field);
    if (index === undefined || parsed === null) return;
    if ((cells[index] ?? "").trim() === parsed) saidOnlyTheNumber.add(index);
  };
  addIfNothingLost(
    "travelMinutes",
    values.travelMinutes === null ? null : String(values.travelMinutes),
  );
  addIfNothingLost("curfew", values.curfew);

  values.notes = composeNotes(
    cells,
    fieldColumn.get("notes"),
    foldedColumns.filter((column) => !saidOnlyTheNumber.has(column.index)),
  );

  if (problems.length > 0) {
    return {
      line,
      values,
      warnings,
      error: capitalise(problems.join("; ")),
      duplicate: false,
    };
  }

  const key = venueNameKey(name);
  const duplicate = existingVenueNames.has(key) || seenInFile.has(key);
  seenInFile.add(key);

  return { line, values, warnings, error: null, duplicate };
}

/**
 * The notes cell, then one heading per column the arithmetic could not
 * use. The blank line between them is what keeps a paragraph somebody
 * wrote looking like a paragraph somebody wrote.
 */
function composeNotes(
  cells: string[],
  notesIndex: number | undefined,
  foldedColumns: Column[],
): string | null {
  const own =
    notesIndex === undefined ? "" : (cells[notesIndex] ?? "").trim();

  const folded = foldedColumns
    .map((column) => ({
      label: column.label,
      value: (cells[column.index] ?? "").trim(),
    }))
    .filter((line) => !saysNothing(line.value))
    .map((line) => `${line.label}: ${line.value}`);

  const parts = [own, folded.join("\n")].filter((part) => part !== "");
  return parts.length === 0 ? null : parts.join("\n\n");
}

/* -------------------------------------------------------------- the cells */

function normaliseHeader(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isUnknown(raw: string): boolean {
  return UNKNOWN_CELLS.has(raw.trim().toLowerCase());
}

function text(raw: string): string | null {
  return isUnknown(raw) ? null : raw;
}

/**
 * Whether a cell is worth a line of its own in the notes.
 *
 * "Curfew: Not published" seventy-one times is clutter that buries the
 * five venues that did publish one. But "None" is an answer - a venue
 * with no accommodation has told you something - so it survives a
 * filter the other blanks do not.
 */
function saysNothing(value: string): boolean {
  return isUnknown(value) && value.trim().toLowerCase() !== "none";
}

/** Whether a catering figure is the venue's own rather than the file's. */
function isQuotedBasis(basis: string): boolean {
  const b = basis.trim().toLowerCase();
  return b === "" || b.startsWith("publish") || b.startsWith("quote");
}

/**
 * The catering total column, and the guest count its header states.
 *
 * A shortlist researched at a fixed guest count quotes food as a total
 * for that many people, so the count is in the header - "Catering est.
 * (121 guests)" - and dividing by it is the only way back to the per-head
 * figure this app stores. Without a count the column is unusable, which
 * the row says rather than guessing at one.
 */
function findCateringColumn(columns: Column[]): CateringColumn | null {
  const column = columns.find(
    (c) => /^catering/.test(c.key) && !CONSUMED_KEYS.has(c.key) && !/policy|basis|note/.test(c.key),
  );
  if (column === undefined) return null;

  const stated = /(\d+)\s*guests?/i.exec(column.label);
  const basis = columns.find((c) => c.key === "catering_basis" || c.key === "basis");

  return {
    ...column,
    guestCount: stated === null ? null : Number(stated[1]),
    basisIndex: basis?.index ?? null,
  };
}

/**
 * Door-to-door minutes from a journey written the way people write one:
 * "65 min", "1h05 flight + 50 min", "350 min / 1h flight".
 *
 * Every leg has to carry a duration or the whole thing comes back null.
 * "Ferry + 2h" is two hours of driving after a crossing of unstated
 * length, and calling that 120 minutes would be worse than admitting
 * the journey is not known - the raw text is kept in the notes either
 * way, so nothing is lost by refusing.
 */
export function parseTravelMinutes(raw: string): number | null {
  if (isUnknown(raw)) return null;

  // The canonical column is already in minutes and says so in its name.
  const plain = raw.trim();
  if (/^\d{1,4}$/.test(plain)) {
    const minutes = Number(plain);
    return minutes > 0 && minutes <= 1440 ? minutes : null;
  }

  // "350 min / 1h flight" offers two ways to get there. The first is the
  // one the column is sorted by, so it is the one meant.
  const journey = raw.split("/")[0];

  let total = 0;
  for (const leg of journey.split("+")) {
    const minutes = legMinutes(leg);
    if (minutes === null) return null;
    total += minutes;
  }

  return total > 0 && total <= 1440 ? total : null;
}

function legMinutes(leg: string): number | null {
  // "1h05", "2h15", "1h", "3h" - hours, optionally with minutes stuck on.
  const hours = /(\d+)\s*h(?:ours?|rs?)?\s*(\d{1,2})?\b/i.exec(leg);
  if (hours !== null) {
    return Number(hours[1]) * 60 + Number(hours[2] ?? 0);
  }
  const minutes = /(\d+)\s*(?:min|minutes?|mins)\b/i.exec(leg);
  if (minutes !== null) return Number(minutes[1]);

  // A leg with no duration in it - a bare "Ferry", or "2 flights", where
  // the 2 counts aircraft and not minutes.
  return null;
}

/**
 * The time the night has to end, when the cell says one thing.
 *
 * "Runs 3pm - 12am" is a range and ends at midnight; "1am liquor licence"
 * is a single time. But "Venue 10am-10pm; outdoor music must stop 9:00pm"
 * holds two different curfews, and picking either would be this module
 * having an opinion about which one binds. Those come back null and stay
 * whole in the notes, where a person can read both.
 */
export function parseCurfew(raw: string): string | null {
  const cell = raw.trim();
  if (isUnknown(cell)) return null;

  // The canonical column is already a time, as the venue dialog writes it.
  const clock = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(cell);
  if (clock !== null) return `${clock[1].padStart(2, "0")}:${clock[2]}`;

  // More than one clause is more than one rule.
  if (/[;,]/.test(cell)) return null;

  const times = [...cell.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)|\b(midnight|midday|noon)\b/gi)];
  if (times.length === 0) return null;

  // "3pm - 12am" is one rule with two ends, so the end is the curfew.
  // Two times with nothing joining them are two different rules.
  const isRange = /[-–—]|\b(?:to|until|till)\b/i.test(cell);
  if (times.length > 1 && !isRange) return null;

  return toTime(times[times.length - 1]);
}

function toTime(match: RegExpMatchArray): string | null {
  const [, hourText, minuteText, meridiem, word] = match;

  if (word !== undefined) {
    return word.toLowerCase() === "midnight" ? "00:00" : "12:00";
  }

  const hour12 = Number(hourText);
  if (hour12 < 1 || hour12 > 12) return null;
  const minute = Number(minuteText ?? 0);
  if (minute > 59) return null;

  const pm = meridiem.toLowerCase() === "pm";
  const hour = hour12 === 12 ? (pm ? 12 : 0) : pm ? hour12 + 12 : hour12;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
