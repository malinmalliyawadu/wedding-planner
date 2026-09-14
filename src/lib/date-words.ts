/**
 * Dates and times the way an engraver sets them.
 *
 * A printed invitation does not say "20/03/2027 14:00". It says
 * "Saturday, the twentieth of March, two thousand and twenty-seven, at
 * two o'clock in the afternoon" - and that convention is most of what
 * makes a card read as a card rather than as a calendar entry. This is
 * the pure half of that: string in, words out, no locale surprises,
 * because the whole point is that the wording is fixed.
 *
 * Numerals still appear on the page alongside these (the calendar button,
 * the at-a-glance strip), so a guest skimming for the date is never made
 * to parse prose to find it. The words are the register; the figures are
 * the reference.
 */

const ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
] as const;

const ORDINAL_ONES = [
  "",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
] as const;

/** 0-99 in words. Hyphenated past twenty, as a typesetter would. */
export function numberInWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) {
    throw new RangeError(`numberInWords handles 0-99, got ${n}`);
  }
  if (n === 0) return "zero";
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = n % 10;
  return ones === 0 ? tens : `${tens}-${ONES[ones]}`;
}

/** 1-31 as an ordinal: "first", "twenty-second", "thirtieth". */
export function ordinalInWords(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    throw new RangeError(`ordinalInWords handles 1-31, got ${n}`);
  }
  if (n < 20) return ORDINAL_ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (ones === 0) {
    // "twenty" -> "twentieth", "thirty" -> "thirtieth".
    return `${TENS[tens].slice(0, -1)}ieth`;
  }
  return `${TENS[tens]}-${ORDINAL_ONES[ones]}`;
}

/**
 * A year in words. "two thousand and twenty-seven" for this century, and
 * the spoken pairwise form ("nineteen ninety-nine") for any other, which
 * is how English actually says them.
 */
export function yearInWords(year: number): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError(`yearInWords handles four-digit years, got ${year}`);
  }
  const thousands = Math.floor(year / 1000);
  const remainder = year % 1000;
  if (remainder < 100) {
    const base = `${ONES[thousands]} thousand`;
    return remainder === 0 ? base : `${base} and ${numberInWords(remainder)}`;
  }
  const high = Math.floor(year / 100);
  const low = year % 100;
  return low === 0
    ? `${numberInWords(high)} hundred`
    : `${numberInWords(high)} ${numberInWords(low)}`;
}

export type DateInWords = {
  /** "Saturday" */
  weekday: string;
  /** "the twentieth of March" */
  day: string;
  /** "two thousand and twenty-seven" */
  year: string;
};

/**
 * An ISO calendar date ("2027-03-20") in three lines of words, split so a
 * layout can stack them. Formatted in UTC like everything in
 * `dates.ts`: a plain date has no timezone and must not drift a day.
 */
export function dateInWords(iso: string): DateInWords {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`dateInWords expects YYYY-MM-DD, got ${iso}`);
  const year = Number(match[1]);
  const day = Number(match[3]);
  const date = new Date(`${iso}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "UTC",
    weekday: "long",
  }).format(date);
  const month = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "UTC",
    month: "long",
  }).format(date);
  return {
    weekday,
    day: `the ${ordinalInWords(day)} of ${month}`,
    year: yearInWords(year),
  };
}

/**
 * A clock time ("14:00", "13:30:00") as an engraver would set it, or null
 * when there is no graceful wording for it. Quarter hours have one -
 * "half past one in the afternoon" - and anything else does not: "two
 * twenty in the afternoon" is not a convention, so the caller falls back
 * to figures rather than inventing one.
 */
export function timeInWords(time: string): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  if (minutes === 0) {
    if (hours === 0) return "midnight";
    if (hours === 12) return "twelve noon";
    return `${hourWord(hours)} o'clock ${period(hours)}`;
  }
  if (minutes === 15) return `a quarter past ${hourWord(hours)} ${period(hours)}`;
  if (minutes === 30) return `half past ${hourWord(hours)} ${period(hours)}`;
  if (minutes === 45) {
    const next = (hours + 1) % 24;
    if (next === 0) return "a quarter to midnight";
    if (next === 12) return "a quarter to noon";
    return `a quarter to ${hourWord(next)} ${period(next)}`;
  }
  return null;
}

function hourWord(hours24: number): string {
  const twelve = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return ONES[twelve];
}

/** Morning until noon, afternoon until five, evening after that. */
function period(hours24: number): string {
  if (hours24 < 12) return "in the morning";
  if (hours24 < 17) return "in the afternoon";
  return "in the evening";
}
