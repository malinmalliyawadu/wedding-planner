/**
 * Minimal RFC 5545 iCalendar writer for all-day events, so the task list
 * can be subscribed to from a phone.
 *
 * The two things that quietly break real calendar clients are line
 * folding (lines are limited by *octets*, not characters, which matters
 * the moment a task mentions Kōwhai) and text escaping. Both are handled
 * here and both are tested.
 */

export type CalendarEvent = {
  /** Stable across regenerations so subscribers update rather than duplicate. */
  uid: string;
  /** ISO date; the event is all-day on this date. */
  date: string;
  summary: string;
  description?: string;
};

export type CalendarOptions = {
  name: string;
  /** Fixed timestamp for DTSTAMP; defaults to now. */
  stamp?: Date;
};

const CRLF = "\r\n";

/** Escape TEXT values per RFC 5545 3.3.11. Order matters: backslash first. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Fold a content line to 75 octets, continuing with a leading space.
 * Counting is by UTF-8 byte length and never splits a character.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  // The first line allows 75 octets; continuations lose one to the space.
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += size;
  }
  if (current !== "") parts.push(current);

  return parts.join(`${CRLF} `);
}

/** "2027-03-20" -> "20270320" */
export function toIcsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

/** The day after, for an all-day event's exclusive DTEND. */
export function nextIcsDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function toIcsStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

export function buildCalendar(
  events: CalendarEvent[],
  options: CalendarOptions,
): string {
  const stamp = toIcsStamp(options.stamp ?? new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Wedding Ledger//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.name)}`,
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(event.date)}`,
      `DTEND;VALUE=DATE:${nextIcsDate(event.date)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join(CRLF) + CRLF;
}
