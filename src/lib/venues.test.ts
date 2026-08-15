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

/** What an outside caterer charges, for the venues that do not. */
const CATERING = { perHeadCents: 14_500, perChildCents: 7_000 };

describe("venueCost", () => {
  it("adds the hire fee to per-head catering at each bracket's rate", () => {
    const cost = venueCost(venue(), COUNTS, CATERING);

    expect(cost.adultsCents).toBe(16_500 * 80);
    expect(cost.childrenCents).toBe(8_000 * 10);
    expect(cost.cateringCents).toBe(1_400_000);
    expect(cost.totalCents).toBe(450_000 + 1_400_000);
  });

  it("charges children at the adult rate when no child rate is set", () => {
    const cost = venueCost(
      venue({ perChildCostCents: null }),
      COUNTS,
      CATERING,
    );

    expect(cost.perChildCents).toBe(16_500);
    expect(cost.childrenCents).toBe(165_000);
  });

  it("leaves an unquoted hire fee out of the total and says the total is a floor", () => {
    // Not zero, and not a guess either: the food is what is known, so the
    // food is what the total holds, and hireUnknown is how every reader
    // of it finds out that the room is still to come.
    const cost = venueCost(
      venue({ hireFixedCostCents: null }),
      COUNTS,
      CATERING,
    );

    expect(cost.hireUnknown).toBe(true);
    expect(cost.hireCents).toBe(0);
    expect(cost.totalCents).toBe(1_400_000);
  });

  it("treats a hire fee of zero as the quote it is", () => {
    // Plenty of venues roll the room into a per-head package. That is a
    // fact about the price, not an empty field.
    const cost = venueCost(venue({ hireFixedCostCents: 0 }), COUNTS, CATERING);

    expect(cost.hireUnknown).toBe(false);
    expect(cost.totalCents).toBe(1_400_000);
  });

  it("counts infants nowhere - they are simply not in the counts", () => {
    // The caller never passes infants; the sum is over adults + children.
    const cost = venueCost(venue(), { adults: 80, children: 0 }, CATERING);
    expect(cost.totalCents).toBe(450_000 + 16_500 * 80);
  });

  it("divides the whole bill, hire included, over chargeable heads", () => {
    const cost = venueCost(venue(), COUNTS, CATERING);
    expect(cost.perGuestCents).toBe(Math.round(1_850_000 / 90));
  });

  it("does not divide by zero when nobody is coming", () => {
    const cost = venueCost(venue(), { adults: 0, children: 0 }, CATERING);
    expect(cost.totalCents).toBe(450_000);
    expect(cost.perGuestCents).toBe(0);
  });

  it("rejects fractional or negative guest counts", () => {
    expect(() =>
      venueCost(venue(), { adults: 80.5, children: 0 }, CATERING),
    ).toThrow();
    expect(() =>
      venueCost(venue(), { adults: -1, children: 0 }, CATERING),
    ).toThrow();
  });

  describe("catering the venue does not sell", () => {
    const dryHire = venue({ perHeadCostCents: null, perChildCostCents: null });

    it("prices an outside caterer rather than feeding everyone for free", () => {
      const cost = venueCost(dryHire, COUNTS, CATERING);

      expect(cost.perAdultCents).toBe(14_500);
      expect(cost.perChildCents).toBe(7_000);
      expect(cost.cateringCents).toBe(14_500 * 80 + 7_000 * 10);
      expect(cost.cateringAssumed).toBe(true);
    });

    it("says so, so no total built on an assumption passes as a quote", () => {
      expect(venueCost(venue(), COUNTS, CATERING).cateringAssumed).toBe(false);
    });

    it("substitutes both rates, never keeping the venue's child discount", () => {
      // A child rate against no adult rate is a leftover, not a quote:
      // it would price children with this venue and adults with the
      // caterer, which is nobody's bill.
      const cost = venueCost(
        venue({ perHeadCostCents: null, perChildCostCents: 100 }),
        COUNTS,
        CATERING,
      );
      expect(cost.perChildCents).toBe(7_000);
    });

    it("charges assumed children at the assumed adult rate when there is none", () => {
      const cost = venueCost(dryHire, COUNTS, {
        perHeadCents: 14_500,
        perChildCents: null,
      });
      expect(cost.perChildCents).toBe(14_500);
    });

    it("puts a bare hall on the same bill as a venue that caters", () => {
      // The whole point: $1,200 of hire is not cheaper than $18,000
      // all-in, it is the same dinner on somebody else's invoice.
      const hall = venue({
        id: 2,
        name: "Bare hall",
        hireFixedCostCents: 120_000,
        perHeadCostCents: null,
        perChildCostCents: null,
      });
      const cost = venueCost(hall, COUNTS, CATERING);

      expect(cost.totalCents).toBe(120_000 + 14_500 * 80 + 7_000 * 10);
      expect(cost.totalCents).toBeGreaterThan(1_000_000);
    });
  });

  describe("minimum spend", () => {
    it("tops the catering up to the minimum, leaving the hire fee outside it", () => {
      // 90 guests spend $14,000; the minimum is $18,000, so $4,000 buys
      // nothing - and the $4,500 hire fee does not count towards it.
      const cost = venueCost(
        venue({ minimumSpendCents: 1_800_000 }),
        COUNTS,
        CATERING,
      );

      expect(cost.cateringCents).toBe(1_400_000);
      expect(cost.minimumTopUpCents).toBe(400_000);
      expect(cost.totalCents).toBe(450_000 + 1_800_000);
    });

    it("adds nothing once the guests clear the minimum", () => {
      const cost = venueCost(
        venue({ minimumSpendCents: 1_000_000 }),
        COUNTS,
        CATERING,
      );

      expect(cost.minimumTopUpCents).toBe(0);
      expect(cost.totalCents).toBe(450_000 + 1_400_000);
    });

    it("counts an assumed spend towards the minimum, not on top of it", () => {
      // A venue with a food minimum caters, so a blank rate there means
      // nobody has asked yet. Billing the caterer *and* the whole
      // minimum would charge the same dinner twice.
      const v = venue({ perHeadCostCents: null, minimumSpendCents: 1_800_000 });
      const cost = venueCost(v, COUNTS, CATERING);

      expect(cost.cateringCents).toBe(1_230_000);
      expect(cost.minimumTopUpCents).toBe(570_000);
      expect(cost.totalCents).toBe(450_000 + 1_800_000);
    });

    it("never refunds the difference when the guests overshoot", () => {
      const under = venueCost(
        venue({ minimumSpendCents: 1_800_000 }),
        COUNTS,
        CATERING,
      );
      const over = venueCost(
        venue({ minimumSpendCents: 100 }),
        COUNTS,
        CATERING,
      );

      expect(under.totalCents).toBeGreaterThan(over.totalCents);
      expect(over.minimumTopUpCents).toBe(0);
    });
  });
});

describe("breakEvenAdults", () => {
  it("is null when the venue has no minimum to reach", () => {
    expect(breakEvenAdults(venue(), 10, CATERING)).toBeNull();
  });

  it("gives the first adult count whose spend reaches the minimum", () => {
    // Minimum $18,000, children cover $800, leaving $17,200 at $165 a head.
    const v = venue({ minimumSpendCents: 1_800_000 });
    const answer = breakEvenAdults(v, 10, CATERING);

    expect(answer).toBe(105);
    expect(
      venueCost(v, { adults: answer!, children: 10 }, CATERING)
        .minimumTopUpCents,
    ).toBe(0);
    expect(
      venueCost(v, { adults: answer! - 1, children: 10 }, CATERING)
        .minimumTopUpCents,
    ).toBeGreaterThan(0);
  });

  it("rounds up rather than landing just short", () => {
    // $1,000 minimum at $30 a head is 33.3 adults, and 33 is not enough.
    const v = venue({
      minimumSpendCents: 100_000,
      perHeadCostCents: 3_000,
      perChildCostCents: 0,
    });
    expect(breakEvenAdults(v, 0, CATERING)).toBe(34);
    expect(
      venueCost(v, { adults: 34, children: 0 }, CATERING).minimumTopUpCents,
    ).toBe(0);
    expect(
      venueCost(v, { adults: 33, children: 0 }, CATERING).minimumTopUpCents,
    ).toBeGreaterThan(0);
  });

  it("is zero when the children alone already clear it", () => {
    const v = venue({ minimumSpendCents: 50_000, perChildCostCents: 8_000 });
    expect(breakEvenAdults(v, 10, CATERING)).toBe(0);
  });

  it("counts up at the assumed rate when the venue quotes none", () => {
    const v = venue({ perHeadCostCents: null, minimumSpendCents: 1_000_000 });
    const answer = breakEvenAdults(v, 10, CATERING);

    // $10,000 less $700 of children, at the caterer's $145 a head.
    expect(answer).toBe(65);
    expect(
      venueCost(v, { adults: answer!, children: 10 }, CATERING)
        .minimumTopUpCents,
    ).toBe(0);
  });

  it("is null when no number of guests can ever reach it", () => {
    // A minimum with nothing per head behind it is just a fee.
    const v = venue({
      minimumSpendCents: 500_000,
      perHeadCostCents: 0,
      perChildCostCents: 0,
    });
    expect(breakEvenAdults(v, 10, CATERING)).toBeNull();
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
    const e = evaluateVenue(venue({ dateAvailable: true }), COUNTS, CATERING);
    expect(e.blockers).toEqual([]);
    expect(e.viable).toBe(true);
  });

  it("blocks a venue too small for the guest list", () => {
    const e = evaluateVenue(venue({ seatedCapacity: 82 }), COUNTS, CATERING);
    expect(e.blockers).toEqual([{ kind: "over_capacity", shortSeats: 8 }]);
    expect(e.viable).toBe(false);
  });

  it("blocks a venue whose date is taken", () => {
    const e = evaluateVenue(venue({ dateAvailable: false }), COUNTS, CATERING);
    expect(e.blockers).toEqual([{ kind: "date_unavailable" }]);
    expect(e.viable).toBe(false);
  });

  it("does not block on an unknown date - not having rung them says nothing", () => {
    const e = evaluateVenue(venue({ dateAvailable: null }), COUNTS, CATERING);
    expect(e.blockers).toEqual([]);
    expect(e.viable).toBe(true);
  });

  it("blocks a venue nobody has asked the capacity of", () => {
    // Otherwise a hall with every cost field left blank wins on price
    // while nobody knows whether the guests would fit in it.
    const e = evaluateVenue(venue({ seatedCapacity: null }), COUNTS, CATERING);
    expect(e.blockers).toEqual([{ kind: "capacity_unknown" }]);
    expect(e.viable).toBe(false);
  });

  it("blocks a venue nobody has asked the hire fee of", () => {
    const e = evaluateVenue(
      venue({ hireFixedCostCents: null }),
      COUNTS,
      CATERING,
    );
    expect(e.blockers).toEqual([{ kind: "hire_unknown" }]);
    expect(e.viable).toBe(false);
  });

  it("does not block a venue that quotes no hire fee at all", () => {
    // Zero is an answer. Blank is the absence of one.
    const e = evaluateVenue(venue({ hireFixedCostCents: 0 }), COUNTS, CATERING);
    expect(e.blockers).toEqual([]);
    expect(e.viable).toBe(true);
  });

  it("does not block on a missing per-head rate, which the caterer fills", () => {
    // The distinction the two unknown-cost blockers turn on: this gap has
    // a defensible number to put in it and the hire fee has none.
    const e = evaluateVenue(
      venue({ perHeadCostCents: null, perChildCostCents: null }),
      COUNTS,
      CATERING,
    );
    expect(e.blockers).toEqual([]);
    expect(e.cost.cateringAssumed).toBe(true);
  });

  it("treats a ruled-out venue as not viable even when nothing is wrong with it", () => {
    const e = evaluateVenue(venue({ status: "ruled_out" }), COUNTS, CATERING);
    expect(e.blockers).toEqual([]);
    expect(e.viable).toBe(false);
  });

  it("collects every blocking fact, not just the first", () => {
    const e = evaluateVenue(
      venue({ seatedCapacity: 82, dateAvailable: false }),
      COUNTS,
      CATERING,
    );
    expect(e.blockers).toHaveLength(2);
  });
});

describe("evaluateVenues", () => {
  const cheap = venue({ id: 1, name: "Cheap", hireFixedCostCents: 100_000 });
  const dear = venue({ id: 2, name: "Dear", hireFixedCostCents: 900_000 });

  it("measures every venue against the cheapest viable one", () => {
    const c = evaluateVenues([dear, cheap], COUNTS, CATERING);

    expect(c.cheapestId).toBe(1);
    expect(c.dearestId).toBe(2);
    expect(c.spreadCents).toBe(800_000);
    expect(byId(c, 1).deltaFromCheapestCents).toBe(0);
    expect(byId(c, 2).deltaFromCheapestCents).toBe(800_000);
  });

  it("keeps the venues in the order they were given", () => {
    const c = evaluateVenues([dear, cheap], COUNTS, CATERING);
    expect(c.evaluations.map((e) => e.venue.id)).toEqual([2, 1]);
  });

  it("will not let a venue you cannot book set the price to beat", () => {
    const tooSmall = venue({
      id: 3,
      name: "Too small",
      hireFixedCostCents: 0,
      seatedCapacity: 20,
    });
    const c = evaluateVenues([tooSmall, cheap, dear], COUNTS, CATERING);

    expect(c.cheapestId).toBe(1);
    // Still measured, and still visibly the cheapest place on the list.
    expect(byId(c, 3).deltaFromCheapestCents).toBe(-100_000);
  });

  it("will not let an unpriced, unmeasured venue win on its blank fields", () => {
    // The dry hall: no capacity recorded and no rate of its own, which
    // on the venue's own bill alone would beat everything on the list.
    // The caterer's rate is what stops that, and the missing capacity
    // still blocks it - one is an estimate, the other is a gap.
    const hall = venue({
      id: 4,
      name: "Bare hall",
      hireFixedCostCents: 120_000,
      perHeadCostCents: null,
      perChildCostCents: null,
      seatedCapacity: null,
    });
    const c = evaluateVenues([hall, cheap, dear], COUNTS, CATERING);

    expect(byId(c, 4).cost.cateringAssumed).toBe(true);
    expect(byId(c, 4).cost.totalCents).toBeGreaterThan(120_000);
    expect(byId(c, 4).blockers).toEqual([{ kind: "capacity_unknown" }]);
    expect(c.cheapestId).toBe(1);
  });

  it("will not let a venue nobody has priced win on the hire fee it has not quoted", () => {
    // The failure this exists to stop: an unasked hire fee reads as free,
    // and the venue tops the list at the food price while the room is
    // still unpriced. It stays on the list, and stays blocked.
    const unasked = venue({
      id: 5,
      name: "Not rung yet",
      hireFixedCostCents: null,
    });
    const c = evaluateVenues([unasked, cheap, dear], COUNTS, CATERING);

    expect(byId(c, 5).cost.totalCents).toBeLessThan(byId(c, 1).cost.totalCents);
    expect(byId(c, 5).blockers).toEqual([{ kind: "hire_unknown" }]);
    expect(c.cheapestId).toBe(1);
  });

  it("lets a dry hire win once its catering is priced honestly", () => {
    // Same hall with a capacity: nothing about it is unknown any more,
    // so it is allowed to be the cheapest - on a total that includes
    // the dinner rather than one that quietly leaves it out.
    const hall = venue({
      id: 4,
      name: "Bare hall",
      hireFixedCostCents: 120_000,
      perHeadCostCents: null,
      perChildCostCents: null,
      seatedCapacity: 120,
    });
    const c = evaluateVenues([hall, cheap, dear], COUNTS, CATERING);

    expect(c.cheapestId).toBe(4);
    expect(byId(c, 4).cost.totalCents).toBe(120_000 + 14_500 * 80 + 7_000 * 10);
  });

  it("copes with nothing viable at all", () => {
    const c = evaluateVenues(
      [venue({ status: "ruled_out" })],
      COUNTS,
      CATERING,
    );

    expect(c.cheapestId).toBeNull();
    expect(c.dearestId).toBeNull();
    expect(c.spreadCents).toBe(0);
    expect(c.evaluations[0].deltaFromCheapestCents).toBe(0);
  });

  it("copes with no venues at all", () => {
    const c = evaluateVenues([], COUNTS, CATERING);
    expect(c.evaluations).toEqual([]);
    expect(c.spreadCents).toBe(0);
  });

  it("compares at the counts it is given, so a venue can come back into range", () => {
    const snug = venue({ id: 4, seatedCapacity: 85 });

    expect(evaluateVenue(snug, COUNTS, CATERING).viable).toBe(false);
    expect(
      evaluateVenue(snug, { adults: 70, children: 5 }, CATERING).viable,
    ).toBe(true);
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
      CATERING,
    );

    expect(costOrder(c.evaluations).map((e) => e.venue.id)).toEqual([3, 1, 2]);
  });

  it("breaks ties by name so the order never wobbles", () => {
    const c = evaluateVenues(
      [venue({ id: 1, name: "Zinnia" }), venue({ id: 2, name: "Akaroa" })],
      COUNTS,
      CATERING,
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
