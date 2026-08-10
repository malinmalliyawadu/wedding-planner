/**
 * Arithmetic on plain "YYYY-MM-DD" calendar dates.
 *
 * Everything here works on the date string itself rather than a Date
 * object in some local zone, so a date can never drift a day because of
 * where the server happens to be. Pacific/Auckland only matters for
 * "today", which lives in `dates.ts`.
 */

export type YMD = { year: number; month: number; day: number };

export function parseISO(iso: string): YMD {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export function formatISO({ year, month, day }: YMD): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Whole days from a to b. Negative when b is before a. */
export function daysBetween(a: string, b: string): number {
  const pa = parseISO(a);
  const pb = parseISO(b);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) -
      Date.UTC(pa.year, pa.month - 1, pa.day)) /
      msPerDay,
  );
}

export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function addDays(iso: string, days: number): string {
  const { year, month, day } = parseISO(iso);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatISO({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

/**
 * Shift by whole months, clamping to the end of a shorter month: one
 * month before 31 March is 28 February, not 3 March.
 */
export function addMonths(iso: string, months: number): string {
  const { year, month, day } = parseISO(iso);
  const zeroBased = month - 1 + months;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = ((zeroBased % 12) + 12) % 12;
  return formatISO({
    year: targetYear,
    month: targetMonth + 1,
    day: Math.min(day, daysInMonth(targetYear, targetMonth + 1)),
  });
}
