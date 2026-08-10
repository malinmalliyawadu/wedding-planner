import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysBetween } from "./iso-date";
import {
  bucketFor,
  bucketTasks,
  dueDateFor,
  generateTimeline,
  normaliseTitle,
  TIMELINE_TEMPLATE,
} from "./timeline";

const WEDDING = "2027-03-20";

describe("iso-date arithmetic", () => {
  it("adds and subtracts days across month and year ends", () => {
    expect(addDays("2027-03-20", -1)).toBe("2027-03-19");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("clamps a month shift to the end of a shorter month", () => {
    expect(addMonths("2027-03-31", -1)).toBe("2027-02-28");
    expect(addMonths("2028-03-31", -1)).toBe("2028-02-29");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
  });

  it("shifts whole years correctly", () => {
    expect(addMonths("2027-03-20", -12)).toBe("2026-03-20");
    expect(addMonths("2027-03-20", -15)).toBe("2025-12-20");
  });
});

describe("dueDateFor", () => {
  it("counts months back from the wedding", () => {
    expect(dueDateFor(WEDDING, { months: 12 })).toBe("2026-03-20");
    expect(dueDateFor(WEDDING, { months: 3 })).toBe("2026-12-20");
  });

  it("counts weeks and days back from the wedding", () => {
    expect(dueDateFor(WEDDING, { weeks: 6 })).toBe("2027-02-06");
    expect(dueDateFor(WEDDING, { days: 1 })).toBe("2027-03-19");
    expect(dueDateFor(WEDDING, { weeks: 1 })).toBe("2027-03-13");
  });

  it("never lands on or after the wedding day", () => {
    for (const task of TIMELINE_TEMPLATE) {
      const due = dueDateFor(WEDDING, task.lead);
      expect(daysBetween(due, WEDDING)).toBeGreaterThan(0);
    }
  });
});

describe("generateTimeline", () => {
  it("dates the whole template backwards from one wedding date", () => {
    const tasks = generateTimeline(WEDDING);
    expect(tasks).toHaveLength(TIMELINE_TEMPLATE.length);
    expect(tasks[0].dueDate).toBe("2026-03-20");
    expect(tasks.at(-1)?.dueDate).toBe("2027-03-19");
  });

  it("returns tasks in date order, earliest first", () => {
    const dates = generateTimeline(WEDDING).map((t) => t.dueDate);
    expect(dates).toEqual([...dates].sort());
  });

  it("skips tasks that already exist, matching titles loosely", () => {
    const existing = new Set(["  book the VENUE ", "Send save-the-dates"]);
    const tasks = generateTimeline(WEDDING, existing);
    const titles = tasks.map((t) => t.title);
    expect(titles).not.toContain("Book the venue");
    expect(titles).not.toContain("Send save-the-dates");
    expect(tasks).toHaveLength(TIMELINE_TEMPLATE.length - 2);
  });

  it("is idempotent: generating over its own output adds nothing", () => {
    const first = generateTimeline(WEDDING);
    const second = generateTimeline(
      WEDDING,
      new Set(first.map((t) => t.title)),
    );
    expect(second).toEqual([]);
  });

  it("gives every task a distinct key and title", () => {
    const keys = TIMELINE_TEMPLATE.map((t) => t.key);
    const titles = TIMELINE_TEMPLATE.map((t) => normaliseTitle(t.title));
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("assigns every task an owner and a category", () => {
    for (const task of generateTimeline(WEDDING)) {
      expect(["a", "b", "both"]).toContain(task.owner);
      expect(task.category.length).toBeGreaterThan(0);
    }
  });

  describe("the marriage licence", () => {
    const licence = TIMELINE_TEMPLATE.find((t) => t.key === "marriage-licence")!;

    it("is the only task flagged for confirmation", () => {
      const flagged = TIMELINE_TEMPLATE.filter((t) => t.needsConfirmation);
      expect(flagged).toHaveLength(1);
      expect(flagged[0].key).toBe("marriage-licence");
    });

    it("says outright that its date is a placeholder", () => {
      expect(licence.note).toMatch(/placeholder/i);
      expect(licence.note).toMatch(/confirm/i);
    });

    it("hardcodes no jurisdiction, deadline or fee", () => {
      const text = `${licence.title} ${licence.note ?? ""}`;
      expect(text).not.toMatch(
        /New Zealand|NZ|Australia|United Kingdom|UK|United States|USA/,
      );
      // No "3 days", "72 hours", "$150" style specifics.
      expect(text).not.toMatch(/\b\d+\s*(clear\s+)?(days?|hours?|weeks?)\b/i);
      expect(text).not.toMatch(/[$£€]\s*\d/);
    });

    it("mentions no legal specifics anywhere else in the template either", () => {
      for (const task of TIMELINE_TEMPLATE) {
        const text = `${task.title} ${task.note ?? ""}`;
        expect(text).not.toMatch(/registrar|registry office|statutory/i);
      }
    });
  });
});

describe("bucketFor", () => {
  const today = "2026-08-09";

  it("sorts a date into the right urgency band", () => {
    expect(bucketFor("2026-08-08", today)).toBe("overdue");
    expect(bucketFor("2026-08-09", today)).toBe("this-week");
    expect(bucketFor("2026-08-16", today)).toBe("this-week");
    expect(bucketFor("2026-08-17", today)).toBe("this-month");
    expect(bucketFor("2026-09-08", today)).toBe("this-month");
    expect(bucketFor("2026-09-09", today)).toBe("next-three-months");
    expect(bucketFor("2026-11-09", today)).toBe("next-three-months");
    expect(bucketFor("2026-11-10", today)).toBe("later");
  });

  it("puts a task with no date in its own bucket", () => {
    expect(bucketFor(null, today)).toBe("undated");
  });
});

describe("bucketTasks", () => {
  const today = "2026-08-09";
  const tasks = [
    { id: 1, dueDate: "2026-12-01", done: false },
    { id: 2, dueDate: "2026-08-01", done: false },
    { id: 3, dueDate: "2026-08-10", done: false },
    { id: 4, dueDate: null, done: false },
    { id: 5, dueDate: "2026-07-01", done: true },
    { id: 6, dueDate: "2026-08-02", done: false },
  ];

  it("groups by urgency in a fixed order", () => {
    const { buckets } = bucketTasks(tasks, today);
    expect(buckets.map((b) => b.bucket)).toEqual([
      "overdue",
      "this-week",
      "later",
      "undated",
    ]);
  });

  it("orders each bucket by date, earliest first", () => {
    const { buckets } = bucketTasks(tasks, today);
    const overdue = buckets.find((b) => b.bucket === "overdue")!;
    expect(overdue.tasks.map((t) => t.id)).toEqual([2, 6]);
  });

  it("keeps completed tasks out of the buckets", () => {
    const { buckets, done } = bucketTasks(tasks, today);
    expect(done.map((t) => t.id)).toEqual([5]);
    expect(buckets.flatMap((b) => b.tasks).map((t) => t.id)).not.toContain(5);
  });

  it("handles an empty list", () => {
    expect(bucketTasks([], today)).toEqual({ buckets: [], done: [] });
  });
});
