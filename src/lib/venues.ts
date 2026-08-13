/**
 * Venue evaluation. Pure functions, integer NZD cents throughout, in the
 * same fixed + per-head language as budget.ts - `resolveChildRate` and
 * `GuestCounts` are imported from there rather than restated, so a venue
 * and a budget item can never disagree about what a child costs.
 *
 * The module is deliberately opinion-free. It compares facts that can be
 * checked - money, seats, whether the date is free - and never scores or
 * ranks by taste. A weighted "which venue is nicer" total would put a
 * spurious ordering on the one decision that is least about arithmetic;
 * what this can do honestly is stop a place being chosen without anyone
 * noticing it costs eleven thousand dollars more, or seats eight fewer
 * people than have been invited.
 *
 * Two things here are not obvious and are the reason this is a module
 * rather than a few expressions in a page:
 *
 * 1. **A minimum spend is a floor on catering, not on the bill.** Venues
 *    quote a hire fee *and* a food-and-beverage minimum, and the hire fee
 *    does not count towards the minimum. So the total is
 *    `hire + max(perHeadSpend, minimum)`, and a small wedding pays for
 *    food nobody eats. `breakEvenAdults` is the guest count at which that
 *    stops being true, which is the number that decides whether a venue
 *    with a big minimum is affordable at all.
 *
 * 2. **Capacity is counted in chairs.** Seats needed is adults +
 *    children; infants sit on laps, exactly as in seating.ts, and are
 *    free, exactly as in budget.ts. One convention, three modules.
 */

import { resolveChildRate, assertGuestCounts, type GuestCounts } from "./budget";
import { ceilDiv } from "./projection";

/** Re-exported so a page comparing venues has one module to import from. */
export type { GuestCounts };

export type VenueStatus = "considering" | "shortlisted" | "booked" | "ruled_out";

/**
 * Only the columns the arithmetic reads. Every function here is generic
 * over `V extends Venue`, so a page can pass whole rows and get whole
 * rows back on the far side without a cast - while the maths still can
 * not quietly start depending on an address.
 */
export type Venue = {
  id: number;
  name: string;
  status: VenueStatus;
  seatedCapacity: number | null;
  standingCapacity: number | null;
  hireFixedCostCents: number;
  perHeadCostCents: number;
  perChildCostCents: number | null;
  minimumSpendCents: number | null;
  dateAvailable: boolean | null;
  travelMinutes: number | null;
};

export type VenueCost = {
  /** The hire fee. A minimum spend does not count towards it. */
  hireCents: number;
  perAdultCents: number;
  perChildCents: number;
  adultsCents: number;
  childrenCents: number;
  /** Adults + children at their rates, before any minimum is applied. */
  cateringCents: number;
  /**
   * What the minimum spend adds because the guest count does not reach
   * it. Zero when there is no minimum or the guests clear it - so a
   * non-zero value here is exactly "money spent on nobody".
   */
  minimumTopUpCents: number;
  totalCents: number;
  /** Total over chargeable heads, rounded to the nearest cent. */
  perGuestCents: number;
};

export function venueCost(venue: Venue, counts: GuestCounts): VenueCost {
  assertGuestCounts(counts);

  const perAdultCents = venue.perHeadCostCents;
  const perChildCents = resolveChildRate(
    venue.perHeadCostCents,
    venue.perChildCostCents,
  );

  const adultsCents = perAdultCents * counts.adults;
  const childrenCents = perChildCents * counts.children;
  const cateringCents = adultsCents + childrenCents;

  const minimumTopUpCents =
    venue.minimumSpendCents === null
      ? 0
      : Math.max(0, venue.minimumSpendCents - cateringCents);

  const totalCents = venue.hireFixedCostCents + cateringCents + minimumTopUpCents;
  const heads = counts.adults + counts.children;

  return {
    hireCents: venue.hireFixedCostCents,
    perAdultCents,
    perChildCents,
    adultsCents,
    childrenCents,
    cateringCents,
    minimumTopUpCents,
    totalCents,
    perGuestCents: heads === 0 ? 0 : Math.round(totalCents / heads),
  };
}

/**
 * How many adults it takes, at this many children, before the per-head
 * spend reaches the minimum.
 *
 * Null when there is no minimum to reach, or when the per-head rate is
 * zero and therefore no number of guests will ever reach it - which is a
 * real quote to receive, and means the minimum is simply a fee.
 */
export function breakEvenAdults(venue: Venue, children: number): number | null {
  if (venue.minimumSpendCents === null) return null;

  const perChildCents = resolveChildRate(
    venue.perHeadCostCents,
    venue.perChildCostCents,
  );
  const remaining = venue.minimumSpendCents - perChildCents * children;
  if (remaining <= 0) return 0;
  if (venue.perHeadCostCents <= 0) return null;

  return ceilDiv(remaining, venue.perHeadCostCents);
}

/* --------------------------------------------------------------- capacity */

/**
 * Guest numbers move by a handful either way right up to the week
 * before, so a venue you fill to within a few chairs is not really a
 * venue that fits.
 */
export const TIGHT_SEAT_MARGIN = 5;

export type CapacityVerdict = "unknown" | "fits" | "tight" | "over";

export type CapacityFit = {
  /** Chairs: adults + children. Infants sit on laps, as in seating.ts. */
  seatsNeeded: number;
  seatedCapacity: number | null;
  verdict: CapacityVerdict;
  /** Capacity less seats needed. Negative when the venue is too small. */
  spareSeats: number | null;
};

export function capacityFit(venue: Venue, counts: GuestCounts): CapacityFit {
  assertGuestCounts(counts);
  const seatsNeeded = counts.adults + counts.children;
  const seatedCapacity = venue.seatedCapacity;

  // Not knowing the capacity is a gap in the record, not a mark against
  // the venue - so it is its own verdict rather than a pass or a fail.
  if (seatedCapacity === null) {
    return { seatsNeeded, seatedCapacity: null, verdict: "unknown", spareSeats: null };
  }

  const spareSeats = seatedCapacity - seatsNeeded;
  const verdict: CapacityVerdict =
    spareSeats < 0 ? "over" : spareSeats < TIGHT_SEAT_MARGIN ? "tight" : "fits";

  return { seatsNeeded, seatedCapacity, verdict, spareSeats };
}

/* -------------------------------------------------------------- evaluation */

/**
 * Why a venue is not somewhere you could book on today's information -
 * as data rather than a sentence, so the page decides the wording, the
 * way buildReport does for seating.
 *
 * `capacity_unknown` is the odd one out and is deliberately here: it is
 * a gap in the record rather than a mark against the place. But "the
 * cheapest one that works" is a claim that everyone fits, and a venue
 * nobody has asked the capacity of cannot support it - a dry hall with
 * no per-head rate would otherwise win every comparison on the strength
 * of the fields left blank.
 */
export type VenueBlocker =
  | { kind: "over_capacity"; shortSeats: number }
  | { kind: "date_unavailable" }
  | { kind: "capacity_unknown" };

export type VenueEvaluation<V extends Venue = Venue> = {
  venue: V;
  cost: VenueCost;
  fit: CapacityFit;
  breakEvenAdults: number | null;
  blockers: VenueBlocker[];
  /**
   * Somewhere you could actually get married: not ruled out by hand, and
   * with no blocking fact against it. Only these set the price to beat.
   */
  viable: boolean;
  /**
   * Against the cheapest viable venue. Computed for every venue, blocked
   * ones included - "the one that does not fit is also the dear one" is
   * worth being able to see. Zero when there is no viable venue at all.
   */
  deltaFromCheapestCents: number;
};

export type VenueComparison<V extends Venue = Venue> = {
  counts: GuestCounts;
  /** Input order, preserved. Sorting is the page's business. */
  evaluations: Array<VenueEvaluation<V>>;
  cheapestId: number | null;
  dearestId: number | null;
  /** Dearest viable less cheapest viable: what the choice is worth. */
  spreadCents: number;
};

export function evaluateVenue<V extends Venue>(
  venue: V,
  counts: GuestCounts,
): Omit<VenueEvaluation<V>, "deltaFromCheapestCents"> {
  const cost = venueCost(venue, counts);
  const fit = capacityFit(venue, counts);

  const blockers: VenueBlocker[] = [];
  if (fit.verdict === "over" && fit.spareSeats !== null) {
    blockers.push({ kind: "over_capacity", shortSeats: -fit.spareSeats });
  }
  if (fit.verdict === "unknown") {
    blockers.push({ kind: "capacity_unknown" });
  }
  // An unknown date does not block: not having rung them yet is the
  // normal state of a venue you are still thinking about, and it says
  // nothing either way. A capacity nobody knows is different, because
  // the comparison claims everyone fits.
  if (venue.dateAvailable === false) {
    blockers.push({ kind: "date_unavailable" });
  }

  return {
    venue,
    cost,
    fit,
    breakEvenAdults: breakEvenAdults(venue, counts.children),
    blockers,
    viable: venue.status !== "ruled_out" && blockers.length === 0,
  };
}

export function evaluateVenues<V extends Venue>(
  venues: V[],
  counts: GuestCounts,
): VenueComparison<V> {
  const partial = venues.map((venue) => evaluateVenue(venue, counts));
  const viable = partial.filter((e) => e.viable);

  const cheapest = minBy(viable, (e) => e.cost.totalCents);
  const dearest = maxBy(viable, (e) => e.cost.totalCents);
  const cheapestCents = cheapest?.cost.totalCents ?? 0;

  return {
    counts,
    evaluations: partial.map((e) => ({
      ...e,
      deltaFromCheapestCents:
        cheapest === null ? 0 : e.cost.totalCents - cheapestCents,
    })),
    cheapestId: cheapest?.venue.id ?? null,
    dearestId: dearest?.venue.id ?? null,
    spreadCents:
      cheapest === null || dearest === null
        ? 0
        : dearest.cost.totalCents - cheapestCents,
  };
}

/**
 * Venues you could book first and cheapest first, with the ones you
 * could not sunk to the bottom rather than dropped: a venue that is too
 * small at 120 guests is back in the running at 90, and hiding it would
 * hide that.
 */
export function costOrder<V extends Venue>(
  evaluations: Array<VenueEvaluation<V>>,
): Array<VenueEvaluation<V>> {
  return [...evaluations].sort((a, b) => {
    if (a.viable !== b.viable) return a.viable ? -1 : 1;
    if (a.cost.totalCents !== b.cost.totalCents)
      return a.cost.totalCents - b.cost.totalCents;
    return a.venue.name.localeCompare(b.venue.name);
  });
}

/** First by the given measure; null for an empty list. Ties keep the earlier. */
function minBy<T>(items: T[], measure: (item: T) => number): T | null {
  return items.reduce<T | null>(
    (best, item) => (best === null || measure(item) < measure(best) ? item : best),
    null,
  );
}

function maxBy<T>(items: T[], measure: (item: T) => number): T | null {
  return items.reduce<T | null>(
    (best, item) => (best === null || measure(item) > measure(best) ? item : best),
    null,
  );
}
