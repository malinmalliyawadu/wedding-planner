/**
 * The day-of run sheet.
 *
 * There is exactly one canonical timeline. A recipient's sheet is that
 * timeline filtered to the moments concerning them - never a separate
 * document that can drift out of step with the real one.
 */

export type RunSheetItem = {
  id: number;
  /** "HH:MM" or "HH:MM:SS" as Postgres hands back a `time`. */
  startTime: string;
  endTime: string | null;
  title: string;
  detail: string | null;
  location: string | null;
  lead: string | null;
  recipientIds: number[];
};

export type Recipient = {
  id: number;
  name: string;
  role: string;
  notes: string | null;
  sortOrder: number;
};

/** Minutes since midnight, for sorting and arithmetic. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Not a time of day: ${time}`);
  }
  return hours * 60 + minutes;
}

/** "14:00:00" -> "2:00 pm". The way a run sheet is actually read. */
export function formatTime(time: string): string {
  const total = toMinutes(time);
  const hours24 = Math.floor(total / 60);
  const minutes = total % 60;
  const suffix = hours24 < 12 ? "am" : "pm";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** "2:00 pm – 2:30 pm", or just the start when there is no end. */
export function formatTimeRange(
  startTime: string,
  endTime: string | null,
): string {
  return endTime === null
    ? formatTime(startTime)
    : `${formatTime(startTime)} – ${formatTime(endTime)}`;
}

/** Length in minutes, or null for a moment rather than a stretch. */
export function durationMinutes(item: RunSheetItem): number | null {
  if (item.endTime === null) return null;
  return toMinutes(item.endTime) - toMinutes(item.startTime);
}

export function sortItems(items: RunSheetItem[]): RunSheetItem[] {
  return [...items].sort((a, b) => {
    const byStart = toMinutes(a.startTime) - toMinutes(b.startTime);
    if (byStart !== 0) return byStart;
    // A moment sits before a stretch beginning at the same time.
    const aEnd = a.endTime === null ? -1 : toMinutes(a.endTime);
    const bEnd = b.endTime === null ? -1 : toMinutes(b.endTime);
    return aEnd - bEnd;
  });
}

/**
 * The moments one recipient needs, in order. An item with no recipients
 * is part of the master sheet only - it is not everyone's business.
 */
export function itemsForRecipient(
  items: RunSheetItem[],
  recipientId: number,
): RunSheetItem[] {
  return sortItems(items.filter((i) => i.recipientIds.includes(recipientId)));
}

export type RunSheetProblem =
  | { kind: "ends-before-it-starts"; item: RunSheetItem }
  | {
      kind: "double-booked";
      item: RunSheetItem;
      other: RunSheetItem;
      /** The recipients expected in both places at once. */
      recipientIds: number[];
    }
  | { kind: "nobody-told"; item: RunSheetItem };

/**
 * What is actually wrong with the day.
 *
 * Overlapping stretches are normal - hair and makeup at the house while
 * the caterer loads in at the venue is exactly how a wedding day runs -
 * so a bare overlap is not reported. What is worth knowing is when the
 * *same* recipient is expected in two places at once. Anything else
 * trains you to ignore this panel.
 */
export function findProblems(items: RunSheetItem[]): RunSheetProblem[] {
  const problems: RunSheetProblem[] = [];
  const sorted = sortItems(items);

  for (const item of sorted) {
    if (item.endTime !== null && toMinutes(item.endTime) < toMinutes(item.startTime)) {
      problems.push({ kind: "ends-before-it-starts", item });
    }
    if (item.recipientIds.length === 0) {
      problems.push({ kind: "nobody-told", item });
    }
  }

  const stretches = sorted.filter(
    (i) => i.endTime !== null && toMinutes(i.endTime) > toMinutes(i.startTime),
  );
  for (let i = 0; i < stretches.length; i++) {
    for (let j = i + 1; j < stretches.length; j++) {
      const a = stretches[i];
      const b = stretches[j];
      if (toMinutes(b.startTime) >= toMinutes(a.endTime!)) continue;

      const shared = a.recipientIds.filter((id) => b.recipientIds.includes(id));
      if (shared.length > 0) {
        problems.push({
          kind: "double-booked",
          item: a,
          other: b,
          recipientIds: shared,
        });
      }
    }
  }

  return problems;
}

/** How long the day runs, first start to last end. */
export function daySpan(
  items: RunSheetItem[],
): { start: string; end: string } | null {
  if (items.length === 0) return null;
  const sorted = sortItems(items);
  const start = sorted[0].startTime;
  const end = sorted.reduce((latest, item) => {
    const candidate = item.endTime ?? item.startTime;
    return toMinutes(candidate) > toMinutes(latest) ? candidate : latest;
  }, sorted[0].endTime ?? sorted[0].startTime);
  return { start, end };
}
