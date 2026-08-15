import { describe, expect, it } from "vitest";
import {
  chanceOver,
  chanceOverMiddling,
  contestedPairs,
  fitStrengths,
  islands,
  MIN_COMPARISONS_PER_VENUE,
  nextPair,
  orderPair,
  pairKey,
  rankVenues,
  type Comparison,
  type Judge,
  type Rankable,
} from "./venue-ranking";

function venues(count: number): Rankable[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Venue ${String.fromCharCode(65 + i)}`,
  }));
}

/** `won` beat `lost`, stored the canonical way round. */
function pick(won: number, lost: number, judge: Judge = "a"): Comparison {
  const [venueAId, venueBId] = orderPair(won, lost);
  return { venueAId, venueBId, winnerId: won, judge };
}

function draw(x: number, y: number, judge: Judge = "a"): Comparison {
  const [venueAId, venueBId] = orderPair(x, y);
  return { venueAId, venueBId, winnerId: null, judge };
}

/** Ids in ranked order, best first. */
function order(ranked: Array<{ venue: Rankable }>): number[] {
  return ranked.map((entry) => entry.venue.id);
}

describe("orderPair / pairKey", () => {
  it("stores a pair one way round whichever way it arrives", () => {
    expect(orderPair(7, 3)).toEqual([3, 7]);
    expect(orderPair(3, 7)).toEqual([3, 7]);
    expect(pairKey(7, 3)).toBe(pairKey(3, 7));
  });
});

describe("fitStrengths", () => {
  it("gives every venue the middling strength when nothing is compared", () => {
    const strengths = fitStrengths([1, 2, 3], []);

    for (const id of [1, 2, 3]) expect(strengths.get(id)).toBe(1);
  });

  it("ranks a venue above one it beat", () => {
    const strengths = fitStrengths([1, 2], [pick(1, 2)]);

    expect(strengths.get(1) as number).toBeGreaterThan(
      strengths.get(2) as number,
    );
  });

  it("leaves two venues level when they draw", () => {
    const strengths = fitStrengths([1, 2], [draw(1, 2)]);

    expect(strengths.get(1)).toBeCloseTo(strengths.get(2) as number, 12);
  });

  it("stays finite for a venue that has won everything", () => {
    // Without the prior this is the case where the likelihood has no
    // maximum and the strength runs away to infinity.
    const strengths = fitStrengths(
      [1, 2, 3, 4],
      [pick(1, 2), pick(1, 3), pick(1, 4)],
    );

    expect(Number.isFinite(strengths.get(1) as number)).toBe(true);
    expect(strengths.get(1) as number).toBeGreaterThan(1);
  });

  it("stays positive for a venue that has lost everything", () => {
    const strengths = fitStrengths(
      [1, 2, 3, 4],
      [pick(2, 1), pick(3, 1), pick(4, 1)],
    );

    expect(strengths.get(1) as number).toBeGreaterThan(0);
    expect(strengths.get(1) as number).toBeLessThan(1);
  });

  it("does not depend on the order the comparisons arrived in", () => {
    // The reason this is a fit and not running Elo: the same opinions
    // entered in a different order must give the same table.
    const comparisons = [
      pick(1, 2),
      pick(2, 3),
      pick(1, 3),
      draw(2, 4),
      pick(4, 3),
    ];
    const forwards = fitStrengths([1, 2, 3, 4], comparisons);
    const backwards = fitStrengths([1, 2, 3, 4], [...comparisons].reverse());

    for (const id of [1, 2, 3, 4]) {
      expect(forwards.get(id)).toBeCloseTo(backwards.get(id) as number, 10);
    }
  });

  it("copes with a preference cycle instead of rejecting it", () => {
    // A beats B beats C beats A happens with venues constantly. The fit
    // should put all three level rather than fail.
    const strengths = fitStrengths([1, 2, 3], [pick(1, 2), pick(2, 3), pick(3, 1)]);

    expect(strengths.get(1)).toBeCloseTo(strengths.get(2) as number, 9);
    expect(strengths.get(2)).toBeCloseTo(strengths.get(3) as number, 9);
  });

  it("orders a transitive chain from top to bottom", () => {
    const strengths = fitStrengths(
      [1, 2, 3, 4],
      [pick(1, 2), pick(2, 3), pick(3, 4), pick(1, 3), pick(2, 4)],
    );

    expect(strengths.get(1) as number).toBeGreaterThan(
      strengths.get(2) as number,
    );
    expect(strengths.get(2) as number).toBeGreaterThan(
      strengths.get(3) as number,
    );
    expect(strengths.get(3) as number).toBeGreaterThan(
      strengths.get(4) as number,
    );
  });

  it("weighs a repeated verdict more heavily than a single one", () => {
    const once = fitStrengths([1, 2, 3], [pick(1, 3), pick(2, 3)]);
    const twice = fitStrengths(
      [1, 2, 3],
      [pick(1, 3), pick(1, 3, "b"), pick(2, 3)],
    );

    expect(twice.get(1) as number).toBeGreaterThan(once.get(1) as number);
  });

  it("ignores a comparison naming a venue no longer on the list", () => {
    const strengths = fitStrengths([1, 2], [pick(1, 2), pick(9, 1)]);

    expect(strengths.has(9)).toBe(false);
    expect(strengths.get(1) as number).toBeGreaterThan(
      strengths.get(2) as number,
    );
  });
});

describe("chanceOverMiddling / chanceOver", () => {
  it("reads a middling strength as an even chance", () => {
    expect(chanceOverMiddling(1)).toBe(0.5);
  });

  it("reads double strength as two times in three", () => {
    expect(chanceOverMiddling(2)).toBeCloseTo(2 / 3, 12);
    expect(chanceOver(2, 1)).toBeCloseTo(2 / 3, 12);
  });

  it("is even between equals", () => {
    expect(chanceOver(3.7, 3.7)).toBe(0.5);
  });
});

describe("islands", () => {
  it("leaves out venues nobody has compared", () => {
    expect(islands([1, 2, 3], [pick(1, 2)])).toEqual([[1, 2]]);
  });

  it("joins venues through a chain of comparisons", () => {
    expect(islands([1, 2, 3, 4], [pick(1, 2), pick(2, 3), pick(3, 4)])).toEqual([
      [1, 2, 3, 4],
    ]);
  });

  it("reports two groups that have never met, largest first", () => {
    const groups = islands(
      [1, 2, 3, 4, 5],
      [pick(1, 2), pick(4, 5), pick(2, 3)],
    );

    expect(groups).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  it("is empty when nothing has been compared", () => {
    expect(islands([1, 2, 3], [])).toEqual([]);
  });
});

describe("contestedPairs", () => {
  it("reports a pair the two of you picked opposite winners of", () => {
    expect(contestedPairs([pick(1, 2, "a"), pick(2, 1, "b")])).toEqual([
      { venueAId: 1, venueBId: 2, pickedByA: 1, pickedByB: 2 },
    ]);
  });

  it("does not count agreement", () => {
    expect(contestedPairs([pick(1, 2, "a"), pick(1, 2, "b")])).toEqual([]);
  });

  it("does not count one of you having a view where the other could not split them", () => {
    expect(contestedPairs([pick(1, 2, "a"), draw(1, 2, "b")])).toEqual([]);
  });

  it("does not count a pair only one of you has answered", () => {
    expect(contestedPairs([pick(1, 2, "a")])).toEqual([]);
  });
});

describe("rankVenues", () => {
  it("puts the winner first and the loser last", () => {
    const ranking = rankVenues(venues(3), [pick(1, 2), pick(1, 3), pick(2, 3)]);

    expect(order(ranking.ranked)).toEqual([1, 2, 3]);
    expect(ranking.ranked[0].rank).toBe(1);
    expect(ranking.ranked[2].rank).toBe(3);
  });

  it("gives venues of equal strength the same rank and skips the next", () => {
    // Nothing compared, so all three are level on the prior alone.
    const ranking = rankVenues(venues(3), []);

    expect(ranking.ranked.map((entry) => entry.rank)).toEqual([1, 1, 1]);
  });

  it("counts wins, losses and draws per venue", () => {
    const ranking = rankVenues(venues(3), [pick(1, 2), draw(1, 3)]);
    const first = ranking.ranked.find((entry) => entry.venue.id === 1);

    expect(first).toMatchObject({ wins: 1, losses: 0, ties: 1, comparisons: 2 });
  });

  it("marks a venue nobody has compared as uncompared, with no island", () => {
    const ranking = rankVenues(venues(3), [pick(1, 2)]);
    const third = ranking.ranked.find((entry) => entry.venue.id === 3);

    expect(third).toMatchObject({
      uncompared: true,
      provisional: false,
      island: null,
      comparisons: 0,
    });
  });

  it("marks a thinly compared venue provisional until it has had enough", () => {
    const ranking = rankVenues(venues(2), [pick(1, 2)]);

    expect(ranking.ranked[0].provisional).toBe(true);
    expect(ranking.venuesSettled).toBe(0);
    expect(ranking.venuesCompared).toBe(2);
  });

  it("stops calling a venue provisional at the threshold", () => {
    const list = venues(2);
    const enough = Array.from({ length: MIN_COMPARISONS_PER_VENUE }, (_, i) =>
      pick(1, 2, i % 2 === 0 ? "a" : "b"),
    );
    const ranking = rankVenues(list, enough);

    expect(ranking.ranked[0].provisional).toBe(false);
    expect(ranking.venuesSettled).toBe(2);
  });

  it("targets enough comparisons to cover every venue, two at a time", () => {
    expect(rankVenues(venues(71), []).targetComparisons).toBe(
      Math.ceil((71 * MIN_COMPARISONS_PER_VENUE) / 2),
    );
  });

  it("reports the groups that have never been compared with each other", () => {
    const ranking = rankVenues(venues(5), [pick(1, 2), pick(4, 5)]);

    expect(ranking.islands).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });

  it("carries the contested pairs through", () => {
    const ranking = rankVenues(venues(2), [pick(1, 2, "a"), pick(2, 1, "b")]);

    expect(ranking.contested).toHaveLength(1);
  });

  it("breaks a tie towards the venue with more comparisons behind it", () => {
    // Both won one and lost one, so both sit at middling strength - but
    // one of them earned it over four comparisons rather than two.
    const ranking = rankVenues(venues(5), [
      pick(1, 4),
      pick(5, 1),
      draw(1, 2),
      draw(1, 3),
      pick(2, 4),
      pick(5, 2),
    ]);
    const first = ranking.ranked.findIndex((entry) => entry.venue.id === 1);
    const second = ranking.ranked.findIndex((entry) => entry.venue.id === 2);

    expect(ranking.ranked[first].comparisons).toBeGreaterThan(
      ranking.ranked[second].comparisons,
    );
    expect(first).toBeLessThan(second);
  });
});

describe("nextPair", () => {
  it("has nothing to ask about a list of one", () => {
    expect(nextPair(venues(1), [], "a")).toBeNull();
  });

  it("returns null once this judge has answered every pair", () => {
    const list = venues(3);
    const all = [pick(1, 2), pick(1, 3), pick(2, 3)];

    expect(nextPair(list, all, "a")).toBeNull();
  });

  it("still asks the other of you about a pair one has answered", () => {
    const list = venues(3);
    const all = [pick(1, 2), pick(1, 3), pick(2, 3)];

    expect(nextPair(list, all, "b")).not.toBeNull();
  });

  it("always includes a venue nobody has compared yet", () => {
    const list = venues(4);
    const pair = nextPair(list, [pick(1, 2)], "a");

    expect(pair).not.toBeNull();
    const ids = [pair?.left.id, pair?.right.id];
    expect(ids.some((id) => id === 3 || id === 4)).toBe(true);
  });

  it("bridges a fresh venue onto the compared group rather than pairing two strangers", () => {
    // Rule 2: pairing the two uncompared venues with each other would
    // make a second island, which is the thing that cannot be ranked.
    const list = venues(4);
    const pair = nextPair(list, [pick(1, 2), pick(2, 1, "b")], "a");
    const ids = [pair?.left.id, pair?.right.id].sort();

    const fresh = ids.filter((id) => id === 3 || id === 4);
    const known = ids.filter((id) => id === 1 || id === 2);
    expect(fresh).toHaveLength(1);
    expect(known).toHaveLength(1);
  });

  it("joins two islands once every venue has been compared once", () => {
    const list = venues(4);
    // Two separate pairs, so two islands and every venue on one
    // comparison. The only useful question left joins them.
    const pair = nextPair(list, [pick(1, 2), pick(3, 4)], "b");
    const ids = [pair?.left.id, pair?.right.id];
    const left = ids.filter((id) => id === 1 || id === 2);
    const right = ids.filter((id) => id === 3 || id === 4);

    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
  });

  it("asks about the close pair rather than one it can already call", () => {
    // 1 beat everything and 4 lost to everything, so asking 1 against 4
    // teaches nothing. 2 and 3 are the pair in the balance.
    const list = venues(4);
    const comparisons = [
      pick(1, 2),
      pick(1, 3),
      pick(1, 4),
      pick(2, 4),
      pick(3, 4),
    ];
    const pair = nextPair(list, comparisons, "a");

    expect([pair?.left.id, pair?.right.id].sort()).toEqual([2, 3]);
  });

  it("asks the same question of the same state every time", () => {
    const list = venues(6);
    const comparisons = [pick(1, 2), pick(3, 4), draw(5, 6)];
    const first = nextPair(list, comparisons, "a");
    const again = nextPair(list, comparisons, "a");

    expect(first?.left.id).toBe(again?.left.id);
    expect(first?.right.id).toBe(again?.right.id);
  });

  it("does not always seat the lower id on the left", () => {
    // A fixed side would quietly pick up whatever bias sitting on the
    // left carries, over hundreds of answers.
    const list = venues(12);
    const comparisons: Comparison[] = [];
    const sides: boolean[] = [];
    for (let i = 0; i < 12; i += 1) {
      const pair = nextPair(list, comparisons, "a");
      if (pair === null) break;
      sides.push(pair.left.id < pair.right.id);
      comparisons.push(pick(pair.left.id, pair.right.id));
    }

    expect(sides).toContain(true);
    expect(sides).toContain(false);
  });

  it("grows one connected group rather than covering fastest", () => {
    const list = venues(8);
    const comparisons: Comparison[] = [];
    for (let i = 0; i < 4; i += 1) {
      const pair = nextPair(list, comparisons, "a");
      if (pair === null) break;
      comparisons.push(pick(pair.left.id, pair.right.id));
    }
    const ranking = rankVenues(list, comparisons);

    // Four answers reach five venues, not eight. Pairing the strangers
    // off with each other would touch all eight at once and leave four
    // islands, no two of which can be ranked against each other; taking
    // one new venue into the group each time keeps the ranking whole the
    // entire way up, and costs no more answers to finish.
    expect(ranking.islands).toHaveLength(1);
    expect(ranking.islands[0]).toHaveLength(5);
    expect(ranking.venuesCompared).toBe(5);
  });

  it("reaches one connected ranking over a realistic run", () => {
    // The whole point of rules 1 and 2: answer the questions it asks and
    // you end up with a single ranking, not a column of fragments.
    const list = venues(20);
    const comparisons: Comparison[] = [];
    for (let i = 0; i < 40; i += 1) {
      const pair = nextPair(list, comparisons, "a");
      if (pair === null) break;
      // A consistent judge: the lower id is always the better venue, so
      // the recovered order should come out sorted.
      const winner = Math.min(pair.left.id, pair.right.id);
      const loser = Math.max(pair.left.id, pair.right.id);
      comparisons.push(pick(winner, loser));
    }
    const ranking = rankVenues(list, comparisons);

    expect(ranking.islands).toHaveLength(1);
    expect(ranking.venuesCompared).toBe(20);

    // Four answers a venue is not enough to pin the exact order - two
    // venues that both won everything and never met each other are
    // genuinely level on this evidence, and the fit is right to say so.
    // It is plenty to sort the list into its right end, which is what a
    // half-finished ranking should be trusted for.
    const ids = order(ranking.ranked);
    expect(Math.max(...ids.slice(0, 5))).toBeLessThanOrEqual(8);
    expect(Math.min(...ids.slice(-5))).toBeGreaterThanOrEqual(13);
  });

  it("recovers the true order from a consistent judge", () => {
    const list = venues(10);
    const comparisons: Comparison[] = [];
    for (let i = 0; i < 60; i += 1) {
      const pair = nextPair(list, comparisons, "a");
      if (pair === null) break;
      comparisons.push(
        pick(
          Math.min(pair.left.id, pair.right.id),
          Math.max(pair.left.id, pair.right.id),
        ),
      );
    }

    expect(order(rankVenues(list, comparisons).ranked)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("runs a seventy-one venue list quickly enough to ask on demand", () => {
    const list = venues(71);
    const comparisons: Comparison[] = [];
    const started = performance.now();
    for (let i = 0; i < 50; i += 1) {
      const pair = nextPair(list, comparisons, "a");
      if (pair === null) break;
      comparisons.push(
        pick(
          Math.min(pair.left.id, pair.right.id),
          Math.max(pair.left.id, pair.right.id),
        ),
      );
    }

    expect(performance.now() - started).toBeLessThan(5000);
    expect(comparisons).toHaveLength(50);
  });
});
