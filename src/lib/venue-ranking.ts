/**
 * Ranking a shortlist that has grown past the point of holding it in your
 * head. Pure functions, no DB, no React - the fourth module of its kind
 * here, and a deliberate counterpart to `venues.ts` rather than an
 * extension of it.
 *
 * `venues.ts` refuses to rank, and that refusal still stands: it compares
 * facts that can be checked and will not score how somewhere feels. What
 * changed at seventy-one venues is not that arithmetic got better at
 * taste - it is that taste stopped fitting in one person's memory. So the
 * opinion here is **entered, never inferred**. Nothing in this file looks
 * at a price, a capacity or a travel time. It only ever asks which of two
 * places you would rather get married at, and adds up the answers.
 *
 * Five decisions carry this module:
 *
 * 1. **Pairs, not scores.** Asked to rate seventy-one venues out of five
 *    you would give forty of them a 3, and the ranking would be ties all
 *    the way down. Asked which of two you prefer you answer instantly and
 *    consistently. The scale is the thing people are bad at; the
 *    comparison is the thing they are good at.
 *
 * 2. **Bradley-Terry, fitted properly, not running Elo.** Sequential Elo
 *    depends on the order the answers arrived in - the same set of
 *    opinions typed in a different order gives a different table, which
 *    is indefensible for something you are going to argue in front of.
 *    `fitStrengths` is a maximum-likelihood fit by MM iteration: a
 *    function of the comparisons as a set, reproducible, and unbothered
 *    by you preferring A to B, B to C and C to A - which happens with
 *    venues constantly and is not an error to be rejected.
 *
 * 3. **Every venue starts with one drawn game against a middling venue.**
 *    That single virtual comparison is what stops the fit running away:
 *    without it a venue that has won its only comparison has infinite
 *    strength and one that has lost its only comparison has none. It also
 *    fixes the scale, so `strength` means something absolute - 1 is "as
 *    good as a middling venue", 2 is "you would pick it over a middling
 *    venue two times in three" - instead of only being readable against
 *    the rest of the column.
 *
 * 4. **A ranking is only as connected as the questions asked.** If every
 *    comparison you have made is among the first ten venues, the other
 *    sixty-one are not ranked below them - they are not ranked at all,
 *    and the prior is the only reason they have a position. `islands`
 *    finds exactly that, because the failure is invisible otherwise: the
 *    fit returns a confident-looking number either way. This is the same
 *    argument as `capacity_unknown` blocking in `venues.ts` - a blank
 *    must not win on being blank.
 *
 * 5. **Disagreement is counted, not modelled.** Where the two of you
 *    picked opposite winners of the same pair is a fact on the record.
 *    Fitting one ranking each and diffing them would dress a handful of
 *    sparse opinions up as a disagreement about the whole list, so
 *    `contestedPairs` reports only the pairs you actually split on.
 */

import { ceilDiv } from "./projection";

/** Which of the two of you made the call. Side A and B, as everywhere. */
export type Judge = "a" | "b";

/**
 * One person's verdict on one pair.
 *
 * The pair is stored one way round only (`venueAId` is always the lower
 * id, see `orderPair`), so a pair cannot be judged twice under two
 * spellings and "have we asked about these two?" is a lookup rather than
 * a search.
 */
export type Comparison = {
  venueAId: number;
  venueBId: number;
  /** The venue preferred. Null is "cannot split them", which is a real answer. */
  winnerId: number | null;
  judge: Judge;
};

/** Anything with an identity and a name: the ranking needs nothing else. */
export type Rankable = { id: number; name: string };

/**
 * How many comparisons a venue wants before its position is worth
 * quoting. Below this the fit is mostly still the prior talking, so the
 * venue is marked provisional rather than being hidden or held back -
 * seeing a rough order early is the point of ranking at all.
 *
 * Six is where a Bradley-Terry strength stops swinging on one answer. It
 * is a rule of thumb and is presented as one.
 */
export const MIN_COMPARISONS_PER_VENUE = 6;

/**
 * The virtual drawn game every venue starts with, against an opponent of
 * fixed strength 1. Half a win and half a loss: enough to keep the fit
 * finite and the scale absolute, light enough that six real comparisons
 * swamp it.
 */
const PRIOR_WINS = 0.5;

/** Guards against a pathological fit looping forever; never reached in practice. */
const MAX_FIT_ITERATIONS = 1000;
const FIT_TOLERANCE = 1e-12;

/** Relative slack within which two strengths are the same rank. */
const TIE_TOLERANCE = 1e-9;

/** The canonical way round to store a pair: lower id first. */
export function orderPair(x: number, y: number): [number, number] {
  return x <= y ? [x, y] : [y, x];
}

/** A stable key for a pair, whichever way round it is handed over. */
export function pairKey(x: number, y: number): string {
  const [lo, hi] = orderPair(x, y);
  return `${lo}:${hi}`;
}

/* -------------------------------------------------------------- the fit */

type Tally = {
  /** Wins, counting a draw as half. */
  wins: number;
  losses: number;
  ties: number;
  /** Comparisons against each opponent, both judges pooled. */
  against: Map<number, number>;
};

/**
 * Wins, losses and draws per venue, and who played whom.
 *
 * Both of you count into one tally. The combined ranking is the wedding's
 * ranking - where you differ is `contestedPairs`, which is a better
 * answer to that question than two thin rankings side by side.
 */
function tally(ids: Set<number>, comparisons: Comparison[]): Map<number, Tally> {
  const tallies = new Map<number, Tally>();
  for (const id of ids) {
    tallies.set(id, { wins: 0, losses: 0, ties: 0, against: new Map() });
  }

  for (const c of comparisons) {
    // A comparison naming a venue that is no longer on the list is
    // dropped rather than half-counted, exactly as seating.ts drops a
    // constraint naming somebody who is not being seated.
    const a = tallies.get(c.venueAId);
    const b = tallies.get(c.venueBId);
    if (a === undefined || b === undefined) continue;

    a.against.set(c.venueBId, (a.against.get(c.venueBId) ?? 0) + 1);
    b.against.set(c.venueAId, (b.against.get(c.venueAId) ?? 0) + 1);

    if (c.winnerId === null) {
      a.ties += 1;
      b.ties += 1;
    } else if (c.winnerId === c.venueAId) {
      a.wins += 1;
      b.losses += 1;
    } else if (c.winnerId === c.venueBId) {
      b.wins += 1;
      a.losses += 1;
    }
  }

  return tallies;
}

/**
 * Maximum-likelihood Bradley-Terry strengths, by MM iteration.
 *
 * The model is `P(i preferred to j) = p_i / (p_i + p_j)`, and the update
 * `p_i <- W_i / Σ n_ij/(p_i + p_j)` climbs the likelihood monotonically
 * from any positive start (Hunter 2004). Every venue additionally carries
 * the drawn game against a fixed opponent of strength 1 described at the
 * top of this file, which is what makes the answer finite for a venue
 * that has won or lost everything, and what pins the scale.
 *
 * Because the phantom opponent's strength is fixed rather than fitted,
 * the result is **not** renormalised afterwards: 1 means "middling" on
 * its own terms, and a venue's number does not move because some
 * unrelated venue was added to the list.
 */
export function fitStrengths(
  ids: number[],
  comparisons: Comparison[],
): Map<number, number> {
  const idSet = new Set(ids);
  const tallies = tally(idSet, comparisons);
  const strengths = new Map<number, number>();
  for (const id of idSet) strengths.set(id, 1);

  for (let iteration = 0; iteration < MAX_FIT_ITERATIONS; iteration += 1) {
    const next = new Map<number, number>();
    let worstChange = 0;

    // Jacobi-style: every venue is updated from the previous round's
    // values, which is the step the monotonic-ascent proof is about.
    // Updating in place would make the answer depend on id order.
    for (const [id, t] of tallies) {
      const p = strengths.get(id) ?? 1;

      let denominator = 0;
      for (const [opponentId, count] of t.against) {
        const q = strengths.get(opponentId) ?? 1;
        denominator += count / (p + q);
      }
      // The prior's two virtual games, against strength 1.
      denominator += (2 * PRIOR_WINS) / (p + 1);

      const numerator = t.wins + t.ties / 2 + PRIOR_WINS;
      const updated = numerator / denominator;
      next.set(id, updated);

      const change = Math.abs(updated - p) / Math.max(p, 1);
      if (change > worstChange) worstChange = change;
    }

    for (const [id, p] of next) strengths.set(id, p);
    if (worstChange < FIT_TOLERANCE) break;
  }

  return strengths;
}

/**
 * The model's odds you would pick this venue over a middling one - the
 * strength read as a probability, which is the form worth showing a
 * person. A strength of 1 gives 0.5, which is what middling means.
 */
export function chanceOverMiddling(strength: number): number {
  return strength / (strength + 1);
}

/** The model's odds you would pick the first venue over the second. */
export function chanceOver(strength: number, otherStrength: number): number {
  const total = strength + otherStrength;
  return total === 0 ? 0.5 : strength / total;
}

/* ------------------------------------------------------------- islands */

/**
 * Groups of venues joined by comparisons, largest first.
 *
 * Two venues in different groups have never been compared, directly or
 * through any chain of other venues, so **nothing in the data says which
 * is better** - the fit puts them in an order regardless, and that order
 * is the prior rather than your opinion. Venues with no comparison at all
 * are left out entirely and reported separately: that is the more basic
 * problem and reads better said plainly.
 */
export function islands(ids: number[], comparisons: Comparison[]): number[][] {
  const idSet = new Set(ids);
  const parent = new Map<number, number>();
  for (const id of idSet) parent.set(id, id);

  const find = (id: number): number => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as number;
    // Path compression, so a long chain of comparisons stays cheap.
    let walk = id;
    while (parent.get(walk) !== root) {
      const up = parent.get(walk) as number;
      parent.set(walk, root);
      walk = up;
    }
    return root;
  };

  const compared = new Set<number>();
  for (const c of comparisons) {
    if (!idSet.has(c.venueAId) || !idSet.has(c.venueBId)) continue;
    compared.add(c.venueAId);
    compared.add(c.venueBId);
    const rootA = find(c.venueAId);
    const rootB = find(c.venueBId);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }

  const groups = new Map<number, number[]>();
  for (const id of [...idSet].sort((x, y) => x - y)) {
    if (!compared.has(id)) continue;
    const root = find(id);
    const group = groups.get(root);
    if (group === undefined) groups.set(root, [id]);
    else group.push(id);
  }

  return [...groups.values()].sort(
    (x, y) => y.length - x.length || x[0] - y[0],
  );
}

/* ------------------------------------------------------------ contested */

/** A pair the two of you picked opposite winners of. */
export type ContestedPair = {
  venueAId: number;
  venueBId: number;
  /** The venue side A preferred. */
  pickedByA: number;
  /** The venue side B preferred. */
  pickedByB: number;
};

/**
 * Pairs you flatly disagree about: one of you picked each venue.
 *
 * One of you picking a winner where the other could not split them is not
 * a disagreement - it is one of you having a view - so it is not counted
 * here. Only a straight contradiction is, because that is the list worth
 * putting in front of the two of you.
 */
export function contestedPairs(comparisons: Comparison[]): ContestedPair[] {
  const byPair = new Map<string, { a?: Comparison; b?: Comparison }>();
  for (const c of comparisons) {
    const key = pairKey(c.venueAId, c.venueBId);
    const entry = byPair.get(key) ?? {};
    entry[c.judge] = c;
    byPair.set(key, entry);
  }

  const contested: ContestedPair[] = [];
  for (const { a, b } of byPair.values()) {
    if (a === undefined || b === undefined) continue;
    if (a.winnerId === null || b.winnerId === null) continue;
    if (a.winnerId === b.winnerId) continue;
    contested.push({
      venueAId: a.venueAId,
      venueBId: a.venueBId,
      pickedByA: a.winnerId,
      pickedByB: b.winnerId,
    });
  }

  return contested.sort(
    (x, y) => x.venueAId - y.venueAId || x.venueBId - y.venueBId,
  );
}

/* ------------------------------------------------------------- ranking */

export type RankedVenue<V extends Rankable = Rankable> = {
  venue: V;
  /** 1-based. Venues of equal strength share a rank, as in any table. */
  rank: number;
  strength: number;
  /** Chance you would pick it over a middling venue, 0 to 1. */
  chanceOverMiddling: number;
  comparisons: number;
  wins: number;
  losses: number;
  ties: number;
  /**
   * Which group of mutually-compared venues this belongs to, largest
   * first from 0. Null when the venue has never been compared, so its
   * place in the order is the prior and not your opinion.
   */
  island: number | null;
  /** Never compared with anything. Its rank is a placeholder. */
  uncompared: boolean;
  /** Compared, but not yet enough times for the position to settle. */
  provisional: boolean;
};

export type Ranking<V extends Rankable = Rankable> = {
  /** Best first. */
  ranked: Array<RankedVenue<V>>;
  comparisonsMade: number;
  /**
   * Comparisons it would take to give every venue
   * `MIN_COMPARISONS_PER_VENUE`, since each one covers two venues. A
   * target to steer by, not a gate - the order is readable long before.
   */
  targetComparisons: number;
  /** Venues with at least one comparison. */
  venuesCompared: number;
  /** Venues at or past `MIN_COMPARISONS_PER_VENUE`. */
  venuesSettled: number;
  /**
   * Groups of venues that have never been compared with each other, by
   * venue id, largest first. One group means the ranking hangs together;
   * more than one means it is really that many separate rankings printed
   * in a single column.
   */
  islands: number[][];
  contested: ContestedPair[];
};

export function rankVenues<V extends Rankable>(
  venues: V[],
  comparisons: Comparison[],
): Ranking<V> {
  const ids = venues.map((v) => v.id);
  const idSet = new Set(ids);
  const tallies = tally(idSet, comparisons);
  const strengths = fitStrengths(ids, comparisons);

  const groups = islands(ids, comparisons);
  const islandOf = new Map<number, number>();
  groups.forEach((group, index) => {
    for (const id of group) islandOf.set(id, index);
  });

  const ranked = venues
    .map((venue) => {
      const t = tallies.get(venue.id) ?? {
        wins: 0,
        losses: 0,
        ties: 0,
        against: new Map<number, number>(),
      };
      const count = t.wins + t.losses + t.ties;
      const strength = strengths.get(venue.id) ?? 1;
      return {
        venue,
        rank: 0,
        strength,
        chanceOverMiddling: chanceOverMiddling(strength),
        comparisons: count,
        wins: t.wins,
        losses: t.losses,
        ties: t.ties,
        island: islandOf.get(venue.id) ?? null,
        uncompared: count === 0,
        provisional: count > 0 && count < MIN_COMPARISONS_PER_VENUE,
      };
    })
    .sort((x, y) => {
      if (!sameStrength(x.strength, y.strength)) return y.strength - x.strength;
      // Equal strength, so the one that earned it over more comparisons
      // goes first: same claim, better evidence.
      if (x.comparisons !== y.comparisons) return y.comparisons - x.comparisons;
      return x.venue.name.localeCompare(y.venue.name);
    });

  // Standard competition ranking: equal strengths share a number and the
  // next distinct strength skips past them.
  let rank = 0;
  let previous: number | null = null;
  ranked.forEach((entry, index) => {
    if (previous === null || !sameStrength(entry.strength, previous)) {
      rank = index + 1;
      previous = entry.strength;
    }
    entry.rank = rank;
  });

  const counted = ranked.filter((entry) => entry.comparisons > 0);

  return {
    ranked,
    comparisonsMade: comparisons.length,
    targetComparisons: ceilDiv(venues.length * MIN_COMPARISONS_PER_VENUE, 2),
    venuesCompared: counted.length,
    venuesSettled: ranked.filter(
      (entry) => entry.comparisons >= MIN_COMPARISONS_PER_VENUE,
    ).length,
    islands: groups,
    contested: contestedPairs(comparisons),
  };
}

/** Two strengths close enough to be the same position in the table. */
function sameStrength(x: number, y: number): boolean {
  return Math.abs(x - y) <= TIE_TOLERANCE * Math.max(x, y, 1);
}

/* ---------------------------------------------------------- what to ask */

/**
 * The pair worth asking about next, or null when this judge has been
 * through every pair there is.
 *
 * With seventy-one venues there are 2,485 pairs and you are going to
 * answer a few hundred of them, so *which* few hundred decides whether
 * the ranking means anything. Three rules in order, and the order is the
 * whole design:
 *
 * 1. **Include a least-compared venue.** Coverage before refinement: a
 *    venue nobody has asked about is a hole in the table, and no amount
 *    of splitting hairs at the top fills it. Both of you count towards
 *    one venue's coverage, so you naturally end up asking about
 *    different pairs rather than duplicating each other.
 *
 * 2. **Join two islands.** A comparison between venues that have never
 *    met, directly or by any chain, is worth more than any number within
 *    a group that is already ranked against itself - it is the
 *    difference between one ranking and two. Bigger island first, so the
 *    list converges on a single connected core instead of a handful of
 *    well-ranked fragments.
 *
 * 3. **Ask the close one.** Between venues the fit already separates,
 *    you know the answer and learn nothing from it. Between venues it
 *    puts level, the answer is genuinely in the balance - that is where
 *    a tap buys the most.
 *
 * Pairs this judge has already answered are never offered again, but the
 * other of you is still asked about them: that is where `contestedPairs`
 * comes from.
 */
export function nextPair<V extends Rankable>(
  venues: V[],
  comparisons: Comparison[],
  judge: Judge,
  strengths?: Map<number, number>,
): { left: V; right: V } | null {
  if (venues.length < 2) return null;

  const ids = venues.map((v) => v.id);
  const fitted = strengths ?? fitStrengths(ids, comparisons);

  const judged = new Set<string>();
  const count = new Map<number, number>(ids.map((id) => [id, 0]));
  const idSet = new Set(ids);
  for (const c of comparisons) {
    if (!idSet.has(c.venueAId) || !idSet.has(c.venueBId)) continue;
    if (c.judge === judge) judged.add(pairKey(c.venueAId, c.venueBId));
    count.set(c.venueAId, (count.get(c.venueAId) ?? 0) + 1);
    count.set(c.venueBId, (count.get(c.venueBId) ?? 0) + 1);
  }

  const groups = islands(ids, comparisons);
  const islandOf = new Map<number, number>();
  const islandSize = new Map<number, number>();
  groups.forEach((group, index) => {
    for (const id of group) islandOf.set(id, index);
    islandSize.set(index, group.length);
  });
  // A venue nobody has compared is an island of one, and joining it to
  // the core is exactly the bridging move rule 2 is about.
  const sizeOf = (id: number) =>
    islandOf.has(id) ? (islandSize.get(islandOf.get(id) as number) as number) : 1;
  const separate = (x: number, y: number) =>
    !islandOf.has(x) || !islandOf.has(y) || islandOf.get(x) !== islandOf.get(y);

  const leastCompared = Math.min(...ids.map((id) => count.get(id) ?? 0));

  // Seeded on how much this judge has done, so successive asks differ
  // while any given state always produces the same question - the same
  // reason seating.ts anneals against mulberry32 rather than Math.random.
  const random = mulberry32(
    comparisons.filter((c) => c.judge === judge).length * 2654435761,
  );

  let best: { left: V; right: V } | null = null;
  let bestScore: number[] | null = null;

  for (let i = 0; i < venues.length; i += 1) {
    for (let j = i + 1; j < venues.length; j += 1) {
      const x = venues[i];
      const y = venues[j];
      const countX = count.get(x.id) ?? 0;
      const countY = count.get(y.id) ?? 0;

      // Rule 1, as a filter rather than a term: a pair that leaves the
      // least-covered venue out is not a candidate at all.
      if (Math.min(countX, countY) !== leastCompared) continue;
      if (judged.has(pairKey(x.id, y.id))) continue;

      const strengthX = fitted.get(x.id) ?? 1;
      const strengthY = fitted.get(y.id) ?? 1;
      const score = [
        separate(x.id, y.id) ? 1 : 0,
        Math.max(sizeOf(x.id), sizeOf(y.id)),
        // Negated: closest strengths score highest. Compared on the log
        // scale, where a strength is a ratio and 4-vs-2 is as far apart
        // as 2-vs-1.
        -Math.abs(Math.log(strengthX) - Math.log(strengthY)),
        random(),
      ];

      if (bestScore === null || beats(score, bestScore)) {
        bestScore = score;
        // Which side of the screen each venue lands on is a coin flip,
        // or the lower id would sit on the left every single time and
        // the answers would pick up whatever bias that carries.
        best = random() < 0.5 ? { left: x, right: y } : { left: y, right: x };
      }
    }
  }

  return best;
}

/** Lexicographic comparison of the rule scores, first rule dominant. */
function beats(score: number[], incumbent: number[]): boolean {
  for (let i = 0; i < score.length; i += 1) {
    if (score[i] !== incumbent[i]) return score[i] > incumbent[i];
  }
  return false;
}

/** Deterministic PRNG so the question asked is reproducible and testable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
