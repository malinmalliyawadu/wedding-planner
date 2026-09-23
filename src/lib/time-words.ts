/**
 * The ceremony time the way an engraver sets it.
 *
 * The card sets the date in figures - "Saturday 20 March 2027" - because
 * a year spelled out ("two thousand and twenty-seven") reads as stiff
 * rather than formal. The time is the one part that stays in words:
 * "at half past two in the afternoon" is the phrase a card is known by,
 * and it reads naturally where the year did not.
 *
 * Figures still appear alongside (the at-a-glance strip, the calendar
 * button), so a guest skimming for the time never has to parse prose.
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
] as const;

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
