/**
 * Seating solver. Pure functions, no DB and no React, so the objective is
 * testable in isolation from the UI that drives it.
 *
 * THE OBJECTIVE FUNCTION
 *
 *   cost =  unseatedGuest      x (guests left without a seat)
 *        +  overCapacityPerSeat x (seats each table is over, summed)
 *        +  the weight of every violated constraint
 *        +  householdSplit      x (extra tables each household spills into)
 *
 * Constraints are binary: a `together` pair is violated when the two sit
 * at different tables, an `apart` pair when they sit at the same one. The
 * violation costs its weight (1-10), which is what makes the weight mean
 * something - one violated "absolutely not" outranks five violated
 * "would be nice", so the nice-to-haves get sacrificed first.
 *
 * Capacity is soft but expensive. At 1000 a seat it dominates any
 * realistic pile of constraint weights, so a legal arrangement is always
 * preferred; keeping it soft rather than forbidden lets the annealer pass
 * through infeasible states instead of getting stuck. When the seats
 * genuinely do not exist it overfills rather than stranding someone
 * (2000 > 1000), and says so.
 *
 * The household term is not a hard requirement of the brief. With few
 * constraints and many guests the rest of the objective is nearly
 * unconstrained, and without it the solver scatters couples and families
 * across the room. Set the weight to 0 for the objective without it.
 */

export type SeatingGuest = {
  id: number;
  firstName: string;
  lastName: string;
  householdId: number;
  pinned: boolean;
  /** Where they are sitting now; the solver starts from this. */
  tableId: number | null;
};

export type SeatingTable = {
  id: number;
  name: string;
  capacity: number;
};

export type SeatingConstraint = {
  id: number;
  guestAId: number;
  guestBId: number;
  kind: "together" | "apart";
  weight: number;
};

export type SeatingWeights = {
  unseatedGuest: number;
  overCapacityPerSeat: number;
  householdSplit: number;
};

export const DEFAULT_WEIGHTS: SeatingWeights = {
  unseatedGuest: 2000,
  overCapacityPerSeat: 1000,
  householdSplit: 3,
};

export type SeatingInput = {
  guests: SeatingGuest[];
  tables: SeatingTable[];
  constraints: SeatingConstraint[];
};

/** guestId -> tableId, or null for unseated. */
export type Assignment = Map<number, number | null>;

export type CostBreakdown = {
  total: number;
  unseated: number;
  overCapacity: number;
  constraints: number;
  households: number;
};

export type Violation = {
  constraint: SeatingConstraint;
  guestAName: string;
  guestBName: string;
  /** The tables they ended up on; null when unseated. */
  tableAName: string | null;
  tableBName: string | null;
};

export type SeatingReport = {
  cost: CostBreakdown;
  violations: Violation[];
  overCapacityTables: Array<{ table: SeatingTable; seated: number; over: number }>;
  unseated: SeatingGuest[];
  splitHouseholds: Array<{ householdId: number; tableCount: number }>;
};

export type SolveOptions = {
  weights?: SeatingWeights;
  /** Rough effort. 60k lands in well under a second for a real wedding. */
  iterations?: number;
  restarts?: number;
  /** Fixing this makes a run reproducible. */
  seed?: number;
};

export type SeatingResult = {
  assignment: Assignment;
  report: SeatingReport;
  /** How many guests the solver actually moved. */
  moved: number;
  iterations: number;
  elapsedMs: number;
};

/* ------------------------------------------------------------------- cost */

/**
 * Full, obviously-correct cost of an assignment. The annealer tracks the
 * same number incrementally for speed; a test pins the two together.
 */
export function scoreAssignment(
  input: SeatingInput,
  assignment: Assignment,
  weights: SeatingWeights = DEFAULT_WEIGHTS,
): CostBreakdown {
  const tableById = new Map(input.tables.map((t) => [t.id, t]));

  let unseated = 0;
  const occupancy = new Map<number, number>();
  const householdTables = new Map<number, Set<number>>();

  for (const guest of input.guests) {
    const tableId = assignment.get(guest.id) ?? null;
    if (tableId === null || !tableById.has(tableId)) {
      unseated += 1;
      continue;
    }
    occupancy.set(tableId, (occupancy.get(tableId) ?? 0) + 1);
    let tables = householdTables.get(guest.householdId);
    if (!tables) {
      tables = new Set();
      householdTables.set(guest.householdId, tables);
    }
    tables.add(tableId);
  }

  let overCapacity = 0;
  for (const table of input.tables) {
    const seated = occupancy.get(table.id) ?? 0;
    if (seated > table.capacity) overCapacity += seated - table.capacity;
  }

  let constraintCost = 0;
  for (const constraint of input.constraints) {
    if (isViolated(constraint, assignment)) constraintCost += constraint.weight;
  }

  let householdSplits = 0;
  for (const tables of householdTables.values()) {
    householdSplits += Math.max(0, tables.size - 1);
  }

  return {
    unseated: unseated * weights.unseatedGuest,
    overCapacity: overCapacity * weights.overCapacityPerSeat,
    constraints: constraintCost,
    households: householdSplits * weights.householdSplit,
    total:
      unseated * weights.unseatedGuest +
      overCapacity * weights.overCapacityPerSeat +
      constraintCost +
      householdSplits * weights.householdSplit,
  };
}

export function isViolated(
  constraint: SeatingConstraint,
  assignment: Assignment,
): boolean {
  const a = assignment.get(constraint.guestAId) ?? null;
  const b = assignment.get(constraint.guestBId) ?? null;
  // An unseated guest satisfies nothing and offends nothing: the unseated
  // penalty already accounts for them.
  if (a === null || b === null) return constraint.kind === "together";
  return constraint.kind === "together" ? a !== b : a === b;
}

/**
 * Everything the arrangement gets wrong, named. The point is to never
 * hand back a bad seating plan that looks fine.
 */
export function buildReport(
  input: SeatingInput,
  assignment: Assignment,
  weights: SeatingWeights = DEFAULT_WEIGHTS,
): SeatingReport {
  const guestById = new Map(input.guests.map((g) => [g.id, g]));
  const tableById = new Map(input.tables.map((t) => [t.id, t]));
  const name = (id: number) => {
    const guest = guestById.get(id);
    return guest ? `${guest.firstName} ${guest.lastName}` : `Guest ${id}`;
  };
  const tableName = (id: number | null) =>
    id === null ? null : (tableById.get(id)?.name ?? null);

  const violations: Violation[] = input.constraints
    .filter((c) => isViolated(c, assignment))
    .map((constraint) => ({
      constraint,
      guestAName: name(constraint.guestAId),
      guestBName: name(constraint.guestBId),
      tableAName: tableName(assignment.get(constraint.guestAId) ?? null),
      tableBName: tableName(assignment.get(constraint.guestBId) ?? null),
    }))
    // Loudest first: a broken weight-10 rule matters more than a weight-1.
    .sort((a, b) => b.constraint.weight - a.constraint.weight);

  const occupancy = new Map<number, number>();
  const householdTables = new Map<number, Set<number>>();
  const unseated: SeatingGuest[] = [];

  for (const guest of input.guests) {
    const tableId = assignment.get(guest.id) ?? null;
    if (tableId === null || !tableById.has(tableId)) {
      unseated.push(guest);
      continue;
    }
    occupancy.set(tableId, (occupancy.get(tableId) ?? 0) + 1);
    let tables = householdTables.get(guest.householdId);
    if (!tables) {
      tables = new Set();
      householdTables.set(guest.householdId, tables);
    }
    tables.add(tableId);
  }

  const overCapacityTables = input.tables
    .map((table) => {
      const seated = occupancy.get(table.id) ?? 0;
      return { table, seated, over: seated - table.capacity };
    })
    .filter((t) => t.over > 0);

  const splitHouseholds = [...householdTables.entries()]
    .filter(([, tables]) => tables.size > 1)
    .map(([householdId, tables]) => ({ householdId, tableCount: tables.size }));

  return {
    cost: scoreAssignment(input, assignment, weights),
    violations,
    overCapacityTables,
    unseated,
    splitHouseholds,
  };
}

/* --------------------------------------------------------------- annealing */

/** Deterministic PRNG so a run can be reproduced and tested. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simulated annealing over table assignments. Pinned guests are held
 * fixed; everyone else may be relocated or swapped.
 *
 * The annealer maintains the cost incrementally - only the tables, the
 * household and the constraints touched by a move are re-examined - so a
 * full run is milliseconds rather than seconds. `scoreAssignment` is the
 * reference implementation the incremental one is checked against.
 */
export function solveSeating(
  input: SeatingInput,
  options: SolveOptions = {},
): SeatingResult {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const iterations = options.iterations ?? 60_000;
  const restarts = options.restarts ?? 3;
  const startedAt = Date.now();

  const tableIds = input.tables.map((t) => t.id);
  const tableCount = tableIds.length;
  const tableIndexById = new Map(tableIds.map((id, i) => [id, i]));
  const capacities = input.tables.map((t) => t.capacity);

  const guests = input.guests;
  const guestCount = guests.length;
  const guestIndexById = new Map(guests.map((g, i) => [g.id, i]));

  // Households as dense indices for the incremental bookkeeping.
  const householdIds = [...new Set(guests.map((g) => g.householdId))];
  const householdIndexById = new Map(householdIds.map((id, i) => [id, i]));
  const guestHousehold = guests.map(
    (g) => householdIndexById.get(g.householdId)!,
  );

  // Constraints touching each guest, as index pairs.
  type FastConstraint = { a: number; b: number; together: boolean; weight: number };
  const fastConstraints: FastConstraint[] = [];
  const constraintsByGuest: number[][] = guests.map(() => []);
  for (const constraint of input.constraints) {
    const a = guestIndexById.get(constraint.guestAId);
    const b = guestIndexById.get(constraint.guestBId);
    if (a === undefined || b === undefined) continue;
    const index = fastConstraints.length;
    fastConstraints.push({
      a,
      b,
      together: constraint.kind === "together",
      weight: constraint.weight,
    });
    constraintsByGuest[a].push(index);
    if (b !== a) constraintsByGuest[b].push(index);
  }

  const movable: number[] = [];
  for (let i = 0; i < guestCount; i++) {
    if (!guests[i].pinned) movable.push(i);
  }

  const startSeats = guests.map((g) => {
    if (g.tableId === null) return -1;
    return tableIndexById.get(g.tableId) ?? -1;
  });

  if (tableCount === 0 || movable.length === 0) {
    const assignment = toAssignment(guests, startSeats, tableIds);
    return {
      assignment,
      report: buildReport(input, assignment, weights),
      moved: 0,
      iterations: 0,
      elapsedMs: Date.now() - startedAt,
    };
  }

  const random = mulberry32(options.seed ?? 0x5eed);

  let bestSeats: number[] = startSeats.slice();
  let bestCost = Infinity;

  for (let restart = 0; restart < Math.max(1, restarts); restart++) {
    // First pass refines what is already there; later passes start from a
    // shuffled fill so the search is not trapped near the current plan.
    const seats =
      restart === 0
        ? startSeats.slice()
        : greedyFill(guests, startSeats, tableCount, capacities, random);

    const state = new SolverState(
      seats,
      guestHousehold,
      householdIds.length,
      tableCount,
      capacities,
      fastConstraints,
      constraintsByGuest,
      weights,
    );

    let temperature = 30;
    const cooling = Math.pow(0.02 / temperature, 1 / Math.max(1, iterations));

    for (let step = 0; step < iterations; step++) {
      const swap = movable.length > 1 && random() < 0.35;
      let delta: number;
      let undo: () => void;

      if (swap) {
        const g1 = movable[(random() * movable.length) | 0];
        const g2 = movable[(random() * movable.length) | 0];
        if (g1 === g2) {
          temperature *= cooling;
          continue;
        }
        const t1 = state.seats[g1];
        const t2 = state.seats[g2];
        if (t1 === t2) {
          temperature *= cooling;
          continue;
        }
        delta = state.relocate(g1, t2) + state.relocate(g2, t1);
        undo = () => {
          state.relocate(g2, t2);
          state.relocate(g1, t1);
        };
      } else {
        const g = movable[(random() * movable.length) | 0];
        const from = state.seats[g];
        // Occasionally consider leaving someone out; it is the only way
        // to reach a legal plan when the seats do not exist.
        const target =
          random() < 0.03 ? -1 : (random() * tableCount) | 0;
        if (target === from) {
          temperature *= cooling;
          continue;
        }
        delta = state.relocate(g, target);
        undo = () => {
          state.relocate(g, from);
        };
      }

      const accept =
        delta <= 0 || random() < Math.exp(-delta / Math.max(temperature, 1e-6));
      if (!accept) undo();

      if (state.cost < bestCost) {
        bestCost = state.cost;
        bestSeats = state.seats.slice();
      }
      temperature *= cooling;
    }
  }

  const assignment = toAssignment(guests, bestSeats, tableIds);
  let moved = 0;
  for (let i = 0; i < guestCount; i++) {
    if (bestSeats[i] !== startSeats[i]) moved += 1;
  }

  return {
    assignment,
    report: buildReport(input, assignment, weights),
    moved,
    iterations: iterations * Math.max(1, restarts),
    elapsedMs: Date.now() - startedAt,
  };
}

function toAssignment(
  guests: SeatingGuest[],
  seats: number[],
  tableIds: number[],
): Assignment {
  const assignment: Assignment = new Map();
  guests.forEach((guest, i) => {
    const seat = seats[i];
    assignment.set(guest.id, seat === -1 ? null : tableIds[seat]);
  });
  return assignment;
}

/** A capacity-respecting random fill, used to seed later restarts. */
function greedyFill(
  guests: SeatingGuest[],
  startSeats: number[],
  tableCount: number,
  capacities: number[],
  random: () => number,
): number[] {
  const seats = startSeats.slice();
  const occupancy = new Array<number>(tableCount).fill(0);

  guests.forEach((guest, i) => {
    if (guest.pinned && seats[i] >= 0) occupancy[seats[i]] += 1;
  });

  const order = guests
    .map((_, i) => i)
    .filter((i) => !guests[i].pinned)
    .sort(() => random() - 0.5);

  for (const i of order) {
    let placed = -1;
    const offset = (random() * tableCount) | 0;
    for (let step = 0; step < tableCount; step++) {
      const t = (offset + step) % tableCount;
      if (occupancy[t] < capacities[t]) {
        placed = t;
        break;
      }
    }
    seats[i] = placed;
    if (placed >= 0) occupancy[placed] += 1;
  }
  return seats;
}

/**
 * Incremental cost bookkeeping. Every relocate returns the exact change
 * in the objective and leaves `cost` consistent with it.
 */
class SolverState {
  seats: number[];
  cost: number;

  private occupancy: number[];
  private householdOfGuest: number[];
  /** [household][table] -> how many of that household sit there. */
  private householdTableCount: Int32Array;
  private householdDistinct: number[];
  private tableCount: number;
  private capacities: number[];
  private constraints: Array<{
    a: number;
    b: number;
    together: boolean;
    weight: number;
  }>;
  private constraintsByGuest: number[][];
  private weights: SeatingWeights;

  constructor(
    seats: number[],
    householdOfGuest: number[],
    householdCount: number,
    tableCount: number,
    capacities: number[],
    constraints: Array<{ a: number; b: number; together: boolean; weight: number }>,
    constraintsByGuest: number[][],
    weights: SeatingWeights,
  ) {
    this.seats = seats;
    this.householdOfGuest = householdOfGuest;
    this.tableCount = tableCount;
    this.capacities = capacities;
    this.constraints = constraints;
    this.constraintsByGuest = constraintsByGuest;
    this.weights = weights;

    this.occupancy = new Array<number>(tableCount).fill(0);
    this.householdTableCount = new Int32Array(householdCount * tableCount);
    this.householdDistinct = new Array<number>(householdCount).fill(0);

    let unseated = 0;
    seats.forEach((seat, guest) => {
      if (seat === -1) {
        unseated += 1;
        return;
      }
      this.occupancy[seat] += 1;
      const h = householdOfGuest[guest];
      const cell = h * tableCount + seat;
      if (this.householdTableCount[cell] === 0) this.householdDistinct[h] += 1;
      this.householdTableCount[cell] += 1;
    });

    let cost = unseated * weights.unseatedGuest;
    for (let t = 0; t < tableCount; t++) {
      cost +=
        Math.max(0, this.occupancy[t] - capacities[t]) *
        weights.overCapacityPerSeat;
    }
    for (const c of constraints) {
      if (this.violated(c)) cost += c.weight;
    }
    for (const distinct of this.householdDistinct) {
      cost += Math.max(0, distinct - 1) * weights.householdSplit;
    }
    this.cost = cost;
  }

  private violated(c: {
    a: number;
    b: number;
    together: boolean;
  }): boolean {
    const sa = this.seats[c.a];
    const sb = this.seats[c.b];
    if (sa === -1 || sb === -1) return c.together;
    return c.together ? sa !== sb : sa === sb;
  }

  /** Move a guest to a table index (or -1 for unseated). Returns the delta. */
  relocate(guest: number, target: number): number {
    const from = this.seats[guest];
    if (from === target) return 0;

    const w = this.weights;
    let delta = 0;

    // Constraints touching this guest, before.
    const touched = this.constraintsByGuest[guest];
    for (const ci of touched) {
      if (this.violated(this.constraints[ci])) delta -= this.constraints[ci].weight;
    }

    // Capacity and household, before.
    const h = this.householdOfGuest[guest];
    if (from !== -1) {
      delta -=
        Math.max(0, this.occupancy[from] - this.capacities[from]) *
        w.overCapacityPerSeat;
    } else {
      delta -= w.unseatedGuest;
    }
    if (target !== -1) {
      delta -=
        Math.max(0, this.occupancy[target] - this.capacities[target]) *
        w.overCapacityPerSeat;
    }
    delta -= Math.max(0, this.householdDistinct[h] - 1) * w.householdSplit;

    // Apply.
    if (from !== -1) {
      this.occupancy[from] -= 1;
      const cell = h * this.tableCount + from;
      this.householdTableCount[cell] -= 1;
      if (this.householdTableCount[cell] === 0) this.householdDistinct[h] -= 1;
    }
    this.seats[guest] = target;
    if (target !== -1) {
      this.occupancy[target] += 1;
      const cell = h * this.tableCount + target;
      if (this.householdTableCount[cell] === 0) this.householdDistinct[h] += 1;
      this.householdTableCount[cell] += 1;
    }

    // Capacity and household, after.
    if (from !== -1) {
      delta +=
        Math.max(0, this.occupancy[from] - this.capacities[from]) *
        w.overCapacityPerSeat;
    }
    if (target !== -1) {
      delta +=
        Math.max(0, this.occupancy[target] - this.capacities[target]) *
        w.overCapacityPerSeat;
    } else {
      delta += w.unseatedGuest;
    }
    delta += Math.max(0, this.householdDistinct[h] - 1) * w.householdSplit;

    // Constraints touching this guest, after.
    for (const ci of touched) {
      if (this.violated(this.constraints[ci])) delta += this.constraints[ci].weight;
    }

    this.cost += delta;
    return delta;
  }
}
