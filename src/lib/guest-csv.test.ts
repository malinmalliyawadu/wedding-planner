import { describe, expect, it } from "vitest";
import { guestNameKey, importableRows, parseGuestCsv } from "./guest-csv";

const HEADER = "household,first_name,last_name,side,age_bracket,dietary_notes";

describe("parseGuestCsv", () => {
  it("parses valid rows with defaults applied", () => {
    const csv = [
      HEADER,
      "Smith Family,Jane,Smith,a,adult,Vegetarian",
      "Smith Family,Bob,Smith,,,",
    ].join("\n");
    const result = parseGuestCsv(csv, new Set());

    expect(result.fileError).toBeNull();
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      household: "Smith Family",
      firstName: "Jane",
      side: "a",
      dietaryNotes: "Vegetarian",
      error: null,
    });
    expect(result.rows[1]).toMatchObject({
      side: "both",
      ageBracket: "adult",
      dietaryNotes: null,
    });
  });

  it("rejects a file without the required header", () => {
    const result = parseGuestCsv("name,surname\nJane,Smith", new Set());
    expect(result.fileError).toContain("household");
    expect(result.rows).toHaveLength(0);
  });

  it("reports row-level validation errors with line numbers", () => {
    const csv = [HEADER, ",Jane,Smith,x,teenager,"].join("\n");
    const { rows } = parseGuestCsv(csv, new Set());
    expect(rows[0].line).toBe(2);
    expect(rows[0].error).toContain("household is blank");
    expect(rows[0].error).toContain('side "x"');
    expect(rows[0].error).toContain('age_bracket "teenager"');
  });

  it("flags duplicates against the database and within the file", () => {
    const csv = [
      HEADER,
      "Smith Family,Jane,Smith,,,",
      "Smith Family,jane,smith,,,",
      "Jones Family,Amy,Jones,,,",
    ].join("\n");
    const existing = new Set([guestNameKey("Amy", "Jones")]);
    const result = parseGuestCsv(csv, existing);

    expect(result.rows.map((r) => r.duplicate)).toEqual([false, true, true]);
    expect(importableRows(result)).toHaveLength(1);
  });

  it("keeps error rows out of the importable set", () => {
    const csv = [HEADER, "Fam,Ok,Person,,,", "Fam,,Broken,,,"].join("\n");
    const result = parseGuestCsv(csv, new Set());
    expect(importableRows(result).map((r) => r.firstName)).toEqual(["Ok"]);
  });
});
