/**
 * Backwards-planned wedding timeline.
 *
 * Every task is defined by how long *before* the wedding it wants doing,
 * so the whole plan falls out of one date. Lead times are the ordinary
 * planning conventions, not rules - everything is editable afterwards.
 *
 * Deliberately jurisdiction-free: nothing here encodes a legal deadline.
 * The marriage licence carries a placeholder date and a note to confirm
 * the real requirement wherever you are marrying.
 */

import { addDays, addMonths, compareISO, daysBetween } from "./iso-date";

export type LeadTime = { months?: number; weeks?: number; days?: number };

export type TemplateTask = {
  /** Stable identity, so regenerating does not duplicate. */
  key: string;
  title: string;
  category: string;
  owner: "a" | "b" | "both";
  lead: LeadTime;
  note?: string;
  /** The date is a guess that depends on local law and must be checked. */
  needsConfirmation?: boolean;
};

export type GeneratedTask = {
  key: string;
  title: string;
  category: string;
  owner: "a" | "b" | "both";
  dueDate: string;
  note?: string;
  needsConfirmation?: boolean;
};

export const TIMELINE_TEMPLATE: TemplateTask[] = [
  // A year out: the things everything else depends on.
  { key: "budget", title: "Agree the budget", category: "Admin", owner: "both", lead: { months: 12 } },
  { key: "venue", title: "Book the venue", category: "Venue", owner: "both", lead: { months: 12 } },
  { key: "guest-list", title: "Draft the guest list", category: "Guests", owner: "both", lead: { months: 12 } },
  { key: "celebrant", title: "Book the celebrant", category: "Ceremony", owner: "both", lead: { months: 12 } },

  { key: "photographer", title: "Book the photographer", category: "Photography", owner: "both", lead: { months: 10 } },
  { key: "caterer", title: "Book the caterer", category: "Food & drink", owner: "both", lead: { months: 10 } },
  { key: "music", title: "Book the music", category: "Entertainment", owner: "both", lead: { months: 10 } },

  { key: "save-the-dates", title: "Send save-the-dates", category: "Guests", owner: "both", lead: { months: 9 } },
  { key: "accommodation", title: "Sort accommodation for people travelling", category: "Logistics", owner: "both", lead: { months: 9 } },

  { key: "dress", title: "Order the dress", category: "Attire", owner: "a", lead: { months: 8 }, note: "Allow time for alterations" },
  { key: "wedding-party", title: "Ask the wedding party", category: "Guests", owner: "both", lead: { months: 8 } },

  { key: "florist", title: "Book the florist", category: "Styling", owner: "a", lead: { months: 6 } },
  { key: "suits", title: "Order the suits", category: "Attire", owner: "b", lead: { months: 6 } },
  { key: "transport", title: "Book guest transport", category: "Logistics", owner: "b", lead: { months: 6 } },
  { key: "honeymoon", title: "Book the honeymoon", category: "Logistics", owner: "both", lead: { months: 6 } },

  { key: "stationery", title: "Order invitations and signage", category: "Styling", owner: "a", lead: { months: 5 } },
  { key: "hair-makeup", title: "Book hair and makeup", category: "Attire", owner: "a", lead: { months: 5 } },

  { key: "cake", title: "Order the cake", category: "Food & drink", owner: "both", lead: { months: 4 } },
  { key: "rings", title: "Buy the rings", category: "Attire", owner: "both", lead: { months: 4 } },

  { key: "invitations", title: "Send the invitations", category: "Guests", owner: "both", lead: { months: 3 } },
  { key: "trial", title: "Hair and makeup trial", category: "Attire", owner: "a", lead: { months: 3 } },
  { key: "menu", title: "Agree the menu", category: "Food & drink", owner: "both", lead: { months: 3 } },

  {
    key: "marriage-licence",
    title: "Apply for the marriage licence",
    category: "Ceremony",
    owner: "both",
    lead: { months: 2 },
    needsConfirmation: true,
    note:
      "PLACEHOLDER DATE - confirm this one. How far ahead you must apply, " +
      "how long the licence stays valid and what it costs all depend on " +
      "where you are marrying. Look up the rule, then set the real date.",
  },
  { key: "vows", title: "Write your vows", category: "Ceremony", owner: "both", lead: { months: 2 } },
  { key: "dress-fitting", title: "Final dress fitting", category: "Attire", owner: "a", lead: { months: 2 } },

  { key: "chase-rsvps", title: "Chase anyone who has not replied", category: "Guests", owner: "both", lead: { weeks: 6 } },

  { key: "final-numbers", title: "Confirm final numbers with the caterer", category: "Food & drink", owner: "both", lead: { months: 1 } },
  { key: "seating", title: "Finalise the seating plan", category: "Guests", owner: "both", lead: { months: 1 } },
  { key: "confirm-suppliers", title: "Confirm every supplier", category: "Logistics", owner: "b", lead: { months: 1 } },
  { key: "run-sheet", title: "Draft the run sheet", category: "Logistics", owner: "both", lead: { months: 1 } },

  { key: "final-payments", title: "Settle the final payments", category: "Admin", owner: "both", lead: { weeks: 2 } },
  { key: "arrival-times", title: "Confirm arrival times with the wedding party", category: "Guests", owner: "both", lead: { weeks: 2 } },

  { key: "rehearsal", title: "Rehearse the ceremony", category: "Ceremony", owner: "both", lead: { weeks: 1 } },
  { key: "send-run-sheet", title: "Send the run sheet to everyone who needs it", category: "Logistics", owner: "both", lead: { weeks: 1 } },
  { key: "pack", title: "Pack for the honeymoon", category: "Logistics", owner: "both", lead: { weeks: 1 } },

  { key: "deliver", title: "Deliver everything to the venue", category: "Logistics", owner: "both", lead: { days: 2 } },
  { key: "rehearsal-dinner", title: "Rehearsal dinner", category: "Ceremony", owner: "both", lead: { days: 1 } },
];

/** Turn a lead time into the date it falls on, counting back from the wedding. */
export function dueDateFor(weddingDate: string, lead: LeadTime): string {
  let date = weddingDate;
  if (lead.months) date = addMonths(date, -lead.months);
  if (lead.weeks) date = addDays(date, -lead.weeks * 7);
  if (lead.days) date = addDays(date, -lead.days);
  return date;
}

/**
 * The whole plan, dated backwards from the wedding and ordered earliest
 * first. `existingTitles` are skipped so regenerating adds only what is
 * missing and never touches what you have already edited.
 */
export function generateTimeline(
  weddingDate: string,
  existingTitles: ReadonlySet<string> = new Set(),
  template: TemplateTask[] = TIMELINE_TEMPLATE,
): GeneratedTask[] {
  const taken = new Set([...existingTitles].map(normaliseTitle));

  return template
    .filter((task) => !taken.has(normaliseTitle(task.title)))
    .map((task) => ({
      key: task.key,
      title: task.title,
      category: task.category,
      owner: task.owner,
      dueDate: dueDateFor(weddingDate, task.lead),
      note: task.note,
      needsConfirmation: task.needsConfirmation,
    }))
    .sort((a, b) => compareISO(a.dueDate, b.dueDate));
}

export function normaliseTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/* --------------------------------------------------------------- grouping */

export type TaskBucket =
  | "overdue"
  | "this-week"
  | "this-month"
  | "next-three-months"
  | "later"
  | "undated";

export const BUCKET_LABELS: Record<TaskBucket, string> = {
  overdue: "Overdue",
  "this-week": "Next 7 days",
  "this-month": "Next 30 days",
  "next-three-months": "Next 3 months",
  later: "Later",
  undated: "No date yet",
};

export const BUCKET_ORDER: TaskBucket[] = [
  "overdue",
  "this-week",
  "this-month",
  "next-three-months",
  "later",
  "undated",
];

/** Which urgency bucket a due date falls in, relative to today. */
export function bucketFor(dueDate: string | null, today: string): TaskBucket {
  if (dueDate === null) return "undated";
  const days = daysBetween(today, dueDate);
  if (days < 0) return "overdue";
  if (days <= 7) return "this-week";
  if (days <= 30) return "this-month";
  if (days <= 92) return "next-three-months";
  return "later";
}

/**
 * Group tasks into urgency buckets, each ordered by date. Completed
 * tasks are handed back separately - they are history, not a to-do.
 */
export function bucketTasks<T extends { dueDate: string | null; done: boolean }>(
  tasks: T[],
  today: string,
): { buckets: Array<{ bucket: TaskBucket; tasks: T[] }>; done: T[] } {
  const byBucket = new Map<TaskBucket, T[]>();
  const done: T[] = [];

  for (const task of tasks) {
    if (task.done) {
      done.push(task);
      continue;
    }
    const bucket = bucketFor(task.dueDate, today);
    const list = byBucket.get(bucket);
    if (list) list.push(task);
    else byBucket.set(bucket, [task]);
  }

  const sortByDate = (a: T, b: T) => {
    if (a.dueDate === null) return b.dueDate === null ? 0 : 1;
    if (b.dueDate === null) return -1;
    return compareISO(a.dueDate, b.dueDate);
  };

  return {
    buckets: BUCKET_ORDER.filter((b) => byBucket.has(b)).map((bucket) => ({
      bucket,
      tasks: [...byBucket.get(bucket)!].sort(sortByDate),
    })),
    done: done.sort(sortByDate),
  };
}
