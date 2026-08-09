const TZ = "Pacific/Auckland";

/** Today's date in Pacific/Auckland as "YYYY-MM-DD". */
export function todayNZ(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/**
 * Format an ISO date ("2027-03-20") as "20 March 2027". Plain calendar
 * dates are formatted in UTC so the day never shifts across midnight;
 * Pacific/Auckland only matters for "today" (todayNZ).
 */
export function formatDateLong(iso: string): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(isoToDate(iso));
}

/** Format an ISO date as "Sat 20 Mar 2027". */
export function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(isoToDate(iso));
}

/** Whole days from today (NZ) until the given ISO date. Negative if past. */
export function daysUntilNZ(iso: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const target = isoToDate(iso).getTime();
  const today = isoToDate(todayNZ()).getTime();
  return Math.round((target - today) / msPerDay);
}

// Interpret the ISO date at UTC noon so the formatted output is stable
// regardless of the server's local timezone.
function isoToDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}
