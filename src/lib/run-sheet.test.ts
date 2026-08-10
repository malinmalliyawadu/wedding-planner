import { describe, expect, it } from "vitest";
import {
  daySpan,
  durationMinutes,
  findProblems,
  formatTime,
  formatTimeRange,
  itemsForRecipient,
  sortItems,
  toMinutes,
  type RunSheetItem,
} from "./run-sheet";

function item(
  id: number,
  startTime: string,
  endTime: string | null = null,
  recipientIds: number[] = [1],
  title = `Item ${id}`,
): RunSheetItem {
  return {
    id,
    startTime,
    endTime,
    title,
    detail: null,
    location: null,
    lead: null,
    recipientIds,
  };
}

describe("toMinutes", () => {
  it("converts a time of day to minutes since midnight", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("14:30")).toBe(870);
    expect(toMinutes("23:59:00")).toBe(1439);
  });

  it("rejects anything that is not a time of day", () => {
    expect(() => toMinutes("24:00")).toThrow(/Not a time of day/);
    expect(() => toMinutes("13:60")).toThrow(/Not a time of day/);
    expect(() => toMinutes("nope")).toThrow(/Not a time of day/);
  });
});

describe("formatTime", () => {
  it("reads as a run sheet reads", () => {
    expect(formatTime("14:00:00")).toBe("2:00 pm");
    expect(formatTime("09:05")).toBe("9:05 am");
    expect(formatTime("16:45")).toBe("4:45 pm");
  });

  it("gets the twelve-hour edges right", () => {
    expect(formatTime("00:00")).toBe("12:00 am");
    expect(formatTime("00:30")).toBe("12:30 am");
    expect(formatTime("12:00")).toBe("12:00 pm");
    expect(formatTime("12:01")).toBe("12:01 pm");
    expect(formatTime("23:59")).toBe("11:59 pm");
  });

  it("shows a range only when there is an end", () => {
    expect(formatTimeRange("14:00", "14:30")).toBe("2:00 pm – 2:30 pm");
    expect(formatTimeRange("14:00", null)).toBe("2:00 pm");
  });
});

describe("durationMinutes", () => {
  it("measures a stretch and leaves a moment undefined", () => {
    expect(durationMinutes(item(1, "14:00", "15:30"))).toBe(90);
    expect(durationMinutes(item(1, "14:00"))).toBeNull();
  });
});

describe("sortItems", () => {
  it("orders by start time", () => {
    const sorted = sortItems([
      item(1, "16:00"),
      item(2, "09:00"),
      item(3, "14:00"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("puts a moment before a stretch that starts at the same time", () => {
    const sorted = sortItems([item(1, "14:00", "15:00"), item(2, "14:00")]);
    expect(sorted.map((i) => i.id)).toEqual([2, 1]);
  });

  it("does not mutate the input", () => {
    const input = [item(1, "16:00"), item(2, "09:00")];
    sortItems(input);
    expect(input.map((i) => i.id)).toEqual([1, 2]);
  });
});

describe("itemsForRecipient", () => {
  const items = [
    item(1, "13:00", null, [1, 2], "Photos"),
    item(2, "14:00", null, [2], "Ceremony"),
    item(3, "12:00", null, [], "Private moment"),
    item(4, "15:00", null, [1], "Canapes"),
  ];

  it("gives a recipient only what concerns them, in order", () => {
    expect(itemsForRecipient(items, 1).map((i) => i.title)).toEqual([
      "Photos",
      "Canapes",
    ]);
    expect(itemsForRecipient(items, 2).map((i) => i.title)).toEqual([
      "Photos",
      "Ceremony",
    ]);
  });

  it("keeps items nobody is assigned to off every recipient sheet", () => {
    expect(itemsForRecipient(items, 1).map((i) => i.id)).not.toContain(3);
    expect(itemsForRecipient(items, 2).map((i) => i.id)).not.toContain(3);
  });

  it("returns nothing for a recipient with no moments", () => {
    expect(itemsForRecipient(items, 99)).toEqual([]);
  });

  it("reads from the one canonical timeline, so an edit reaches everyone", () => {
    const edited = items.map((i) =>
      i.id === 1 ? { ...i, title: "Photos (moved)" } : i,
    );
    expect(itemsForRecipient(edited, 1)[0].title).toBe("Photos (moved)");
    expect(itemsForRecipient(edited, 2)[0].title).toBe("Photos (moved)");
  });
});

describe("findProblems", () => {
  it("catches an item that ends before it starts", () => {
    const problems = findProblems([item(1, "15:00", "14:00")]);
    expect(problems.some((p) => p.kind === "ends-before-it-starts")).toBe(true);
  });

  it("catches one recipient expected in two places at once", () => {
    const problems = findProblems([
      item(1, "14:00", "15:00", [1, 2]),
      item(2, "14:30", "15:30", [2, 3]),
    ]);
    const clash = problems.find((p) => p.kind === "double-booked");
    expect(clash).toBeDefined();
    expect(clash!.kind === "double-booked" && clash!.recipientIds).toEqual([2]);
  });

  it("leaves overlaps between different people alone", () => {
    // Hair and makeup at the house while the caterer loads in at the
    // venue: entirely normal, and flagging it teaches you to ignore
    // this panel.
    const problems = findProblems([
      item(1, "09:00", "12:00", [1]),
      item(2, "11:00", "13:00", [2]),
    ]);
    expect(problems.filter((p) => p.kind === "double-booked")).toEqual([]);
  });

  it("allows stretches that merely touch", () => {
    const problems = findProblems([
      item(1, "14:00", "15:00", [1]),
      item(2, "15:00", "16:00", [1]),
    ]);
    expect(problems.filter((p) => p.kind === "double-booked")).toEqual([]);
  });

  it("does not call a moment inside a stretch a clash", () => {
    const problems = findProblems([
      item(1, "14:00", "16:00", [1]),
      item(2, "15:00", null, [1]),
    ]);
    expect(problems.filter((p) => p.kind === "double-booked")).toEqual([]);
  });

  it("flags anything nobody has been told about", () => {
    const problems = findProblems([item(1, "14:00", null, [])]);
    expect(problems.some((p) => p.kind === "nobody-told")).toBe(true);
  });

  it("is quiet about a day that hangs together", () => {
    expect(
      findProblems([
        item(1, "13:00", "14:00"),
        item(2, "14:00", "15:00"),
        item(3, "15:30"),
      ]),
    ).toEqual([]);
  });

  it("names every recipient caught in a clash, not just the first", () => {
    const problems = findProblems([
      item(1, "14:00", "15:00", [1, 2, 3]),
      item(2, "14:30", "15:30", [2, 3]),
    ]);
    const clash = problems.find((p) => p.kind === "double-booked");
    expect(clash!.kind === "double-booked" && clash!.recipientIds).toEqual([2, 3]);
  });
});

describe("daySpan", () => {
  it("runs from the first start to the last end", () => {
    expect(
      daySpan([
        item(1, "14:00", "15:00"),
        item(2, "09:30", "10:00"),
        item(3, "22:00"),
      ]),
    ).toEqual({ start: "09:30", end: "22:00" });
  });

  it("uses an end time even when a later item is only a moment", () => {
    expect(daySpan([item(1, "09:00", "23:30"), item(2, "20:00")])).toEqual({
      start: "09:00",
      end: "23:30",
    });
  });

  it("is null for an empty day", () => {
    expect(daySpan([])).toBeNull();
  });
});
