import type { VenueStatus } from "@/lib/venues";

/**
 * How far along you are with a venue, in the words you would use. Shared
 * by the dialog's picker and the comparison's chips so the two can never
 * drift apart.
 */
export const STATUS_LABELS: Record<VenueStatus, string> = {
  considering: "Considering",
  shortlisted: "Shortlisted",
  booked: "Booked",
  ruled_out: "Ruled out",
};

export const STATUS_TONES = {
  considering: "neutral",
  shortlisted: "brass",
  booked: "fern",
  ruled_out: "madder",
} as const satisfies Record<VenueStatus, string>;
