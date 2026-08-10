import { describe, expect, it } from "vitest";
import {
  buildCalendar,
  escapeText,
  foldLine,
  nextIcsDate,
  toIcsDate,
} from "./ics";

const encoder = new TextEncoder();
const STAMP = new Date("2026-08-09T21:00:00Z");

describe("escapeText", () => {
  it("escapes the four characters RFC 5545 reserves", () => {
    expect(escapeText("a;b,c\\d")).toBe("a\\;b\\,c\\\\d");
    expect(escapeText("line one\nline two")).toBe("line one\\nline two");
  });

  it("escapes backslashes before anything else, not after", () => {
    // Getting the order wrong turns \ into \\; rather than \\
    expect(escapeText("\\;")).toBe("\\\\\\;");
  });

  it("normalises every flavour of line break", () => {
    expect(escapeText("a\r\nb\rc\nd")).toBe("a\\nb\\nc\\nd");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeText("Book the celebrant")).toBe("Book the celebrant");
  });
});

describe("foldLine", () => {
  it("leaves a short line untouched", () => {
    expect(foldLine("SUMMARY:Book the venue")).toBe("SUMMARY:Book the venue");
  });

  it("folds at 75 octets with a leading space on continuations", () => {
    const line = `SUMMARY:${"a".repeat(200)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]).toHaveLength(75);
    for (const part of parts.slice(1)) {
      expect(part.startsWith(" ")).toBe(true);
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    }
    // Unfolding gets the original back.
    expect(folded.split("\r\n ").join("")).toBe(line);
  });

  it("counts octets, not characters, so macrons do not overflow", () => {
    // Each ō is two octets: 60 characters but 120 octets.
    const line = `SUMMARY:${"ō".repeat(60)}`;
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.split("\r\n ").join("")).toBe(line);
  });

  it("never splits a multi-byte character across a fold", () => {
    const line = `X:${"日".repeat(50)}`;
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) {
      // A split character would decode to a replacement char.
      expect(part).not.toContain("�");
    }
    expect(folded.split("\r\n ").join("")).toBe(line);
  });
});

describe("date helpers", () => {
  it("writes dates in the basic format", () => {
    expect(toIcsDate("2027-03-20")).toBe("20270320");
  });

  it("ends an all-day event on the following day", () => {
    expect(nextIcsDate("2027-03-20")).toBe("20270321");
    expect(nextIcsDate("2026-12-31")).toBe("20270101");
    expect(nextIcsDate("2028-02-28")).toBe("20280229");
  });
});

describe("buildCalendar", () => {
  const calendar = buildCalendar(
    [
      {
        uid: "task-1@wedding-ledger",
        date: "2027-03-20",
        summary: "The wedding",
        description: "Ru & Malin",
      },
      {
        uid: "task-2@wedding-ledger",
        date: "2027-01-20",
        summary: "Confirm; the caterer, please",
      },
    ],
    { name: "The Wedding Ledger", stamp: STAMP },
  );

  it("wraps the events in a valid calendar", () => {
    expect(calendar.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(calendar).toContain("VERSION:2.0");
    expect(calendar).toContain("METHOD:PUBLISH");
    expect(calendar).toContain("X-WR-CALNAME:The Wedding Ledger");
  });

  it("uses CRLF line endings throughout", () => {
    const bareNewlines = calendar.split("\n").filter((l) => !l.endsWith("\r"));
    // Only the trailing empty string after the final CRLF.
    expect(bareNewlines).toEqual([""]);
  });

  it("writes each event as an all-day VEVENT with a stable UID", () => {
    expect(calendar).toContain("UID:task-1@wedding-ledger");
    expect(calendar).toContain("DTSTART;VALUE=DATE:20270320");
    expect(calendar).toContain("DTEND;VALUE=DATE:20270321");
    expect(calendar).toContain("DTSTAMP:20260809T210000Z");
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(calendar.match(/END:VEVENT/g)).toHaveLength(2);
  });

  it("escapes text inside summaries", () => {
    expect(calendar).toContain("SUMMARY:Confirm\\; the caterer\\, please");
  });

  it("omits the description when there is none", () => {
    expect(calendar.match(/DESCRIPTION:/g)).toHaveLength(1);
  });

  it("marks events as free time so a phone does not look busy all day", () => {
    expect(calendar.match(/TRANSP:TRANSPARENT/g)).toHaveLength(2);
  });

  it("keeps every emitted line inside 75 octets", () => {
    const longCalendar = buildCalendar(
      [
        {
          uid: "task-9@wedding-ledger",
          date: "2027-03-20",
          summary: "Kōwhai ".repeat(30),
          description: "Pōhutukawa ".repeat(40),
        },
      ],
      { name: "The Wedding Ledger", stamp: STAMP },
    );
    for (const line of longCalendar.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("produces an empty but valid calendar for no events", () => {
    const empty = buildCalendar([], { name: "Nothing", stamp: STAMP });
    expect(empty).toContain("BEGIN:VCALENDAR");
    expect(empty).not.toContain("BEGIN:VEVENT");
  });
});
