import { describe, expect, it } from "vitest";
import {
  breakEvenAdults,
  capacityFit,
  costOrder,
  evaluateVenue,
  evaluateVenues,
  TIGHT_SEAT_MARGIN,
  venueCost,
  type Venue,
} from "./venues";

function venue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: 1,
    name: "Kōwhai Barn",
    status: "considering",
    seatedCapacity: 120,
    standingCapacity: 160,
    hireFixedCostCents: 450_000,
    perHeadCostCents: 16_500,
    perChildCostCents: 8_000,
    minimumSpendCents: null,
    dateAvailable: null,
    travelMinutes: 35,
    ...overrides,
  };
}

const COUNTS = { adults: 80, children: 10 };

describe("venueCost", () => {
  it("adds the hire fee to per-head catering at each bracket's rate", () => {
    const cost = venueCost(venue(), COUNTS);

    expect(cost.adultsCents).toBe(16_500 * 80);
    expect(cost.childrenCents).toBe(8_000 * 10);
    expect(cost.cateringCents).toBe(1_400_000);
    expect(cost.totalCents).toBe(450_000 + 1_400_000);
  });

  it("charges children at the adult rate when no child rate is set", () => {
    const cost = venueCost(venue({ perChildCostCents: null }), COUNTS);

    expect(cost.perChildCents).toBe(16_500);
    expect(cost.childrenCents).toBe(165_000);
  });

  it("counts infants nowhere - they are simply not in the counts", () => {
    // The caller never passes infants; the sum is over adults + children.
    const cost = venueCost(venue(), { adults: 80, children: 0 });
    expect(cost.totalCents).toBe(450_000 + 16_500 * 80);
  });

  it("divides the whole bill, hire included, over chargeable heads", () => {
    const cost = venueCost(venue(), COUNTS);
    expect(cost.perGuestCents).toBe(Math.round(1_850_000 / 90));
  });

  it("does not divide by zero when nobody is coming", () => {
    const cost = venueCost(venue(), { adults: 0, children: 0 });
    expect(cost.totalCents).toBe(450_000);
    expect(cost.perGuestCents).toBe(0);
  });

  it("rejects fractional or negative guest counts", () => {
    expect(() => venueCost(venue(), { adults: 80.5, children: 0 })).toThrow();
    expect(() => venueCost(venue(), { adults: -1, children: 0 })).toThrow();
  });

  describe("minimum spend", () => {
    it("tops the catering up to the minimum, leaving the hire fee outside it", () => {
      // 90 guests spend $14,000; the minimum is $18,000, so $4,000 buys
      // nothing - and the $4,500 hire fee does not count towards it.
      const cost = venueCost(venue({ minimumSpendCents: 1_800_000 }), COUNTS);

      expect(cost.cateringCents).toBe(1_400_000);
      expect(cost.minimumTopUpCents).toBe(400_000);
      expect(cost.totalCents).toBe(450_000 + 1_800_000);
    });

    it("adds nothing once the guests clear the minimum", () => {
      const cost = venueCost(venue({ minimumSpendCents: 1_000_000 }), COUNTS);

      expect(cost.minimumTopUpCents).toBe(0);
      expect(cost.totalCents).toBe(450_000 + 1_400_000);
    });

    it("never refunds the difference when the guests overshoot", () => {
      const under = venueCost(venue({ minimumSpendCents: 1_800_000 }), COUNTS);
      const over = venueCost(venue({ minimumSpendCents: 100 }), COUNTS);

      expect(under.totalCents).toBeGreaterThan(over.totalCents);
      expect(over.minimumTopUpCents).toBe(0);
    });
  });
});

describe("breakEvenAdults", () => {
  it("is null when the venue has no minimum to reach", () => {
    expect(breakEvenAdults(venue(), 10)).toBeNull();
  });

  it("gives the first adult count whose spend reaches the minimum", () => {
    // Minimum $18,000, children cover $800, leaving $17,200 at $165 a head.
    const v = venue({ minimumSpendCents: 1_800_000 });
    const answer = breakEvenAdults(v, 10);

    expect(answer).toBe(105);
    expect(
      venueCost(v, { adults: answer!, children: 10 }).minimumTopUpCents,
    ).toBe(0);
    expect(
      venueCost(v, { adults: answer! - 1, children: 10 }).minimumTopUpCents,
    ).toBeGreaterThan(0);
  });

  it("rounds up rather than landing just short", () => {
    // $1,000 minimum at $30 a head is 33.3 adults, and 33 is not enough.
    const v = venue({
      minimumSpendCents: 100_000,
      perHeadCostCents: 3_000,
      perChildCostCents: 0,
    });
    expect(breakEvenAdults(v, 0)).toBe(34);
    expect(venueCost(v, { adults: 34, children: 0 }).minimumTopUpCents).toBe(0);
    expect(
      venueCost(v, { adults: 33, children: 0 }).minimumTopUpCents,
    ).toBeGreaterThan(0);
  });

  it("is zero when the children alone already clear it", () => {
    const v = venue({ minimumSpendCents: 50_000, perChildCostCents: 8_000 });
    expect(breakEvenAdults(v, 10)).toBe(0);
  });

  it("is null when no number of guests can ever reach it", () => {
    // A minimum with nothing per head behind it is just a fee.
    const v = venue({
      minimumSpendCents: 500_000,
      perHeadCostCents: 0,
      perChildCostCents: 0,
    });
    expect(breakEvenAdults(v, 10)).toBeNull();
  });
});

describe("capacityFit", () => {
  it("counts chairs as adults + children, infants on laps", () => {
    expect(capacityFit(venue(), COUNTS).seatsNeeded).toBe(90);
  });

  it("fits when there is room to spare", () => {
    const fit = capacityFit(venue({ seatedCapacity: 120 }), COUNTS);
    expect(fit.verdict).toBe("fits");
    expect(fit.spareSeats).toBe(30);
  });

  it("is tight when the spare seats are within an RSVP swing", () => {
    const fit = capacityFit(
      venue({ seatedCapacity: 90 + TIGHT_SEAT_MARGIN - 1 }),
      COUNTS,
    );
    expect(fit.verdict).toBe("tight");
  });

  it("is a fit again at exactly the margin", () => {
    const fit = capacityFit(
      venue({ seatedCapacity: 90 + TIGHT_SEAT_MARGIN }),
      COUNTS,
    );
    expect(fit.verdict).toBe("fits");
  });

  it("is tight, not over, at exactly capacity", () => {
    const fit = capacityFit(venue({ seatedCapacity: 90 }), COUNTS);
    expect(fit.verdict).toBe("tight");
    expect(fit.spareSeats).toBe(0);
  });

  it("reports how many seats short it is when over", () => {
    const fit = capacityFit(venue({ seatedCapacity: 82 }), COUNTS);
    expect(fit.verdict).toBe("over");
    expect(fit.spareSeats).toBe(-8);
  });

  it("says unknown rather than guessing when capacity is not recorded", () => {
    const fit = capacityFit(venue({ seatedCapacity: null }), COUNTS);
    expect(fit.verdict).toBe("unknown");
    expect(fit.spareSeats).toBeNull();
  });
});

describe("evaluateVenue", () => {
  it("has no blockers for a venue that fits on a free date", () => {
    const e = evaluateVenue(venue({ dateAvailable: true }), COUNTS);
    expect(e.blockers).toEqual([]);
    expect(e.viable).toBe(true);
  });

  it("blocks a venue too small for the guest list", () => {
    const e = evaluateVenue(venue({ seatedCapacity: 82 }), COUNTS);
    expect(e.blockers).toEqual([{ kind: "over_capacity", shortSeats: 8 }]);
    expect(e.viable).toBe(false);
  });

  it("blocks a venue whose date is taken", () => {
    const e = evaluateVenue(venue({ dateAvailable: false }), COUNTS);
    expect(e.blockers).toEqual([{ kind: "date_unavailable" }]);
    expect(e.viable).toBe(false);
  });

  it("does not block on an unknown date - not having rung them says nothing", () => {
    const e = evaluateVenue(venue({ dateAvailable: null }), COUNTS);
    expect(e.blockers).toEqual([]);
    expect(e.viable).toBe(true);
  });

  it("blocks a venue nobody has asked the capacity of", () => {
    // Otherwise a hall with every cost field left blank wins on price
    // while nobody knows whether the guests would fit in it.
    const e = evaluateVenue(venue({ seatedCapacity: null }), COUNTS);
    expect(e.blockers).toEqual([{ kind: "capacity_unknown" }]);
    expect(e.viable).toBe(false);
  });

  it("treats a ruled-out venue as not viable even when nothing is wrong with it", () => {
    const e = evaluateVenue(venue({ status: "ruled_out" }), COUNTS);
    expect(e.blockers).toEqual([]);
    expect(e.viable).toBe(false);
  });

  it("collects every blocking fact, not just the first", () => {
    const e = evaluateVenue(
      venue({ seatedCapacity: 82, dateAvailable: false }),
      COUNTS,
    );
    expect(e.blockers).toHaveLength(2);
  });
});

describe("evaluateVenues", () => {
  const cheap = venue({ id: 1, name: "Cheap", hireFixedCostCents: 100_000 });
  const dear = venue({ id: 2, name: "Dear", hireFixedCostCents: 900_000 });

  it("measures every venue against the cheapest viable one", () => {
    const c = evaluateVenues([dear, cheap], COUNTS);

    expect(c.cheapestId).toBe(1);
    expect(c.dearestId).toBe(2);
    expect(c.spreadCents).toBe(800_000);
    expect(byId(c, 1).deltaFromCheapestCents).toBe(0);
    expect(byId(c, 2).deltaFromCheapestCents).toBe(800_000);
  });

  it("keeps the venues in the order they were given", () => {
    const c = evaluateVenues([dear, cheap], COUNTS);
    expect(c.evaluations.map((e) => e.venue.id)).toEqual([2, 1]);
  });

  it("will not let a venue you cannot book set the price to beat", () => {
    const tooSmall = venue({
      id: 3,
      name: "Too small",
      hireFixedCostCents: 0,
      seatedCapacity: 20,
    });
    const c = evaluateVenues([tooSmall, cheap, dear], COUNTS);

    expect(c.cheapestId).toBe(1);
    // Still measured, and still visibly the cheapest place on the list.
    expect(byId(c, 3).deltaFromCheapestCents).toBe(-100_000);
  });

  it("will not let an unpriced, unmeasured venue win on its blank fields", () => {
    // The dry hall: no capacity recorded and nothing per head, so on
    // arithmetic alone it beats everything on the list.
    const hall = venue({
      id: 4,
      name: "Bare hall",
      hireFixedCostCents: 120_000,
      perHeadCostCents: 0,
      perChildCostCents: null,
      seatedCapacity: null,
    });
    const c = evaluateVenues([hall, cheap, dear], COUNTS);

    expect(byId(c, 4).cost.totalCents).toBeLessThan(byId(c, 1).cost.totalCents);
    expect(c.cheapestId).toBe(1);
  });

  it("copes with nothing viable at all", () => {
    const c = evaluateVenues([venue({ status: "ruled_out" })], COUNTS);

    expect(c.cheapestId).toBeNull();
    expect(c.dearestId).toBeNull();
    expect(c.spreadCents).toBe(0);
    expect(c.evaluations[0].deltaFromCheapestCents).toBe(0);
  });

  it("copes with no venues at all", () => {
    const c = evaluateVenues([], COUNTS);
    expect(c.evaluations).toEqual([]);
    expect(c.spreadCents).toBe(0);
  });

  it("compares at the counts it is given, so a venue can come back into range", () => {
    const snug = venue({ id: 4, seatedCapacity: 85 });

    expect(evaluateVenue(snug, COUNTS).viable).toBe(false);
    expect(evaluateVenue(snug, { adults: 70, children: 5 }).viable).toBe(true);
  });
});

describe("costOrder", () => {
  it("puts bookable venues first, then cheapest first", () => {
    const c = evaluateVenues(
      [
        venue({ id: 1, name: "Dear", hireFixedCostCents: 900_000 }),
        venue({ id: 2, name: "Blocked", hireFixedCostCents: 0, seatedCapacity: 20 }),
        venue({ id: 3, name: "Cheap", hireFixedCostCents: 100_000 }),
      ],
      COUNTS,
    );

    expect(costOrder(c.evaluations).map((e) => e.venue.id)).toEqual([3, 1, 2]);
  });

  it("breaks ties by name so the order never wobbles", () => {
    const c = evaluateVenues(
      [venue({ id: 1, name: "Zinnia" }), venue({ id: 2, name: "Akaroa" })],
      COUNTS,
    );
    expect(costOrder(c.evaluations).map((e) => e.venue.name)).toEqual([
      "Akaroa",
      "Zinnia",
    ]);
  });
});

function byId(comparison: ReturnType<typeof evaluateVenues>, id: number) {
  const found = comparison.evaluations.find((e) => e.venue.id === id);
  if (!found) throw new Error(`No evaluation for venue ${id}`);
  return found;
}
