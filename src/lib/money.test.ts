import { describe, expect, it } from "vitest";
import {
  centsToInput,
  formatCents,
  formatCentsWhole,
  parseDollarsToCents,
} from "./money";

describe("formatCents", () => {
  it("formats cents as NZD with two decimal places", () => {
    expect(formatCents(123_456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
  });

  it("rejects non-integer cents", () => {
    expect(() => formatCents(100.5)).toThrow(/integer cents/);
  });
});

describe("formatCentsWhole", () => {
  it("rounds to whole dollars", () => {
    expect(formatCentsWhole(123_456)).toBe("$1,235");
    expect(formatCentsWhole(123_449)).toBe("$1,234");
  });
});

describe("centsToInput", () => {
  it("drops the decimals on whole dollars and keeps them otherwise", () => {
    expect(centsToInput(16_500)).toBe("165");
    expect(centsToInput(16_550)).toBe("165.50");
    expect(centsToInput(5)).toBe("0.05");
    expect(centsToInput(0)).toBe("0");
  });

  it("uses an empty string for not-set", () => {
    expect(centsToInput(null)).toBe("");
  });

  it("keeps the sign on a negative amount", () => {
    expect(centsToInput(-4_210)).toBe("-42.10");
  });
});

describe("parseDollarsToCents", () => {
  it("parses plain and formatted amounts without float error", () => {
    expect(parseDollarsToCents("1,234.56")).toBe(123_456);
    expect(parseDollarsToCents("$80")).toBe(8_000);
    expect(parseDollarsToCents("165.5")).toBe(16_550);
    expect(parseDollarsToCents("0.07")).toBe(7);
    // The classic float trap: 19.99 * 100 === 1998.9999999999998
    expect(parseDollarsToCents("19.99")).toBe(1_999);
  });

  it("parses negative amounts", () => {
    expect(parseDollarsToCents("-42.10")).toBe(-4_210);
  });

  it("round-trips through centsToInput", () => {
    for (const cents of [0, 5, 100, 16_500, 16_550, 123_456, -4_210]) {
      expect(parseDollarsToCents(centsToInput(cents))).toBe(cents);
    }
  });

  it("rejects malformed input", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("1.234")).toBeNull();
    expect(parseDollarsToCents("1.2.3")).toBeNull();
    expect(parseDollarsToCents("1e5")).toBeNull();
  });
});
