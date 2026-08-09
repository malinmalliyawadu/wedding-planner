/**
 * All money in the app is integer NZD cents. These helpers are the only
 * place cents meet display strings; nothing outside the render boundary
 * should ever hold a float dollar amount.
 */

const nzd = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const nzdWhole = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Format cents as "$1,234.56". */
export function formatCents(cents: number): string {
  assertIntegerCents(cents);
  return nzd.format(cents / 100);
}

/**
 * Format cents as whole dollars ("$1,235") for dense tables and summary
 * figures. Rounds half-up on the cents.
 */
export function formatCentsWhole(cents: number): string {
  assertIntegerCents(cents);
  return nzdWhole.format(Math.round(cents / 100));
}

/**
 * Parse a user-entered dollar amount ("1,234.56", "$80", "165.5") into
 * integer cents without any float arithmetic. Returns null for input
 * that is not a plain dollar amount or has more than 2 decimal places.
 */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, "").replace(/,/g, "");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const cents =
    parseInt(whole, 10) * 100 + parseInt(fraction.padEnd(2, "0") || "0", 10);
  return sign === "-" ? -cents : cents;
}

/**
 * Cents to the plain dollar string a form input should hold: 16500 becomes
 * "165", 16550 becomes "165.50". Null becomes "" so a blank input can mean
 * "not set". The inverse of parseDollarsToCents for editing.
 */
export function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  assertIntegerCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const fraction = abs - whole * 100;
  return fraction === 0
    ? `${sign}${whole}`
    : `${sign}${whole}.${String(fraction).padStart(2, "0")}`;
}

function assertIntegerCents(cents: number): void {
  if (!Number.isInteger(cents)) {
    throw new Error(`Money must be integer cents, got ${cents}`);
  }
}
