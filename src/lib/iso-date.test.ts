import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  daysBetween,
  monthGrid,
  monthKey,
  startOfMonth,
  weekdayIndex,
} from "./iso-date";

describe("weekdayIndex", () => {
  it("counts from Monday", () => {
    // 2027-03-15 is a Monday.
    expect(weekdayIndex("2027-03-15")).toBe(0);
    expect(weekdayIndex("2027-03-20")).toBe(5);
    expect(weekdayIndex("2027-03-21")).toBe(6);
  });

  it("does not drift across a leap day", () => {
    expect(weekdayIndex("2028-02-28")).toBe(0);
    expect(weekdayIndex("2028-02-29")).toBe(1);
    expect(weekdayIndex("2028-03-01")).toBe(2);
  });
});

describe("startOfMonth", () => {
  it("keeps the month and clamps the day", () => {
    expect(startOfMonth("2027-03-20")).toBe("2027-03-01");
    expect(startOfMonth("2027-01-01")).toBe("2027-01-01");
  });
});

describe("monthKey", () => {
  it("drops the day", () => {
    expect(monthKey("2027-03-20")).toBe("2027-03");
  });
});

describe("monthGrid", () => {
  it("is always six whole weeks", () => {
    const grid = monthGrid("2027-03-20");
    expect(grid).toHaveLength(42);
    expect(weekdayIndex(grid[0])).toBe(0);
    expect(weekdayIndex(grid[41])).toBe(6);
    expect(daysBetween(grid[0], grid[41])).toBe(41);
  });

  it("starts on the Monday on or before the first", () => {
    // 1 March 2027 is a Monday: the grid starts on it, not a week earlier.
    expect(monthGrid("2027-03-20")[0]).toBe("2027-03-01");
    // 1 April 2027 is a Thursday: the grid backs up to 29 March.
    expect(monthGrid("2027-04-10")[0]).toBe("2027-03-29");
  });

  it("contains every day of the month", () => {
    const grid = monthGrid("2028-02-14");
    const inMonth = grid.filter((d) => monthKey(d) === "2028-02");
    expect(inMonth).toHaveLength(29);
    expect(inMonth[0]).toBe("2028-02-01");
    expect(inMonth.at(-1)).toBe("2028-02-29");
  });

  it("runs consecutively with no gaps", () => {
    const grid = monthGrid("2026-12-31");
    for (let i = 1; i < grid.length; i++) {
      expect(grid[i]).toBe(addDays(grid[i - 1], 1));
    }
  });

  it("gives the same grid for every day of a month", () => {
    expect(monthGrid("2027-05-01")).toEqual(monthGrid("2027-05-31"));
  });
});

describe("addMonths", () => {
  it("clamps to the end of a shorter month", () => {
    expect(addMonths("2027-03-31", -1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("crosses years in both directions", () => {
    expect(addMonths("2027-12-15", 1)).toBe("2028-01-15");
    expect(addMonths("2027-01-15", -1)).toBe("2026-12-15");
    expect(addMonths("2027-06-15", 12)).toBe("2028-06-15");
  });
});
