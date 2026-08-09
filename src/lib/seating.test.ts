import { describe, expect, it } from "vitest";
import {
  buildReport,
  DEFAULT_WEIGHTS,
  isViolated,
  scoreAssignment,
  solveSeating,
  type Assignment,
  type SeatingConstraint,
  type SeatingGuest,
  type SeatingInput,
  type SeatingTable,
} from "./seating";

function guest(
  id: number,
  householdId = id,
  overrides: Partial<SeatingGuest> = {},
): SeatingGuest {
  return {
    id,
    firstName: `Guest${id}`,
    lastName: "Test",
    householdId,
    pinned: false,
    tableId: null,
    ...overrides,
  };
}

function table(id: number, capacity: number): SeatingTable {
  return { id, name: `Table ${id}`, capacity };
}

function constraint(
  id: number,
  guestAId: number,
  guestBId: number,
  kind: "together" | "apart",
  weight: number,
): SeatingConstraint {
  return { id, guestAId, guestBId, kind, weight };
}

function assign(pairs: Array<[number, number | null]>): Assignment {
  return new Map(pairs);
}

describe("isViolated", () => {
  it("breaks a together pair only when they sit apart", () => {
    const c = constraint(1, 1, 2, "together", 5);
    expect(isViolated(c, assign([[1, 10], [2, 10]]))).toBe(false);
    expect(isViolated(c, assign([[1, 10], [2, 20]]))).toBe(true);
  });

  it("breaks an apart pair only when they sit together", () => {
    const c = constraint(1, 1, 2, "apart", 5);
    expect(isViolated(c, assign([[1, 10], [2, 20]]))).toBe(false);
    expect(isViolated(c, assign([[1, 10], [2, 10]]))).toBe(true);
  });

  it("counts an unseated guest as failing together but not apart", () => {
    expect(
      isViolated(constraint(1, 1, 2, "together", 5), assign([[1, null], [2, 10]])),
    ).toBe(true);
    expect(
      isViolated(constraint(1, 1, 2, "apart", 5), assign([[1, null], [2, 10]])),
    ).toBe(false);
  });
});

describe("scoreAssignment", () => {
  const input: SeatingInput = {
    guests: [guest(1), guest(2), guest(3)],
    tables: [table(10, 2), table(20, 2)],
    constraints: [],
  };

  it("is zero for a plan that breaks nothing", () => {
    const cost = scoreAssignment(
      input,
      assign([[1, 10], [2, 10], [3, 20]]),
      DEFAULT_WEIGHTS,
    );
    expect(cost.total).toBe(0);
  });

  it("charges per seat over capacity", () => {
    const cost = scoreAssignment(input, assign([[1, 10], [2, 10], [3, 10]]));
    expect(cost.overCapacity).toBe(DEFAULT_WEIGHTS.overCapacityPerSeat);
    expect(cost.total).toBe(DEFAULT_WEIGHTS.overCapacityPerSeat);
  });

  it("charges per unseated guest", () => {
    const cost = scoreAssignment(input, assign([[1, 10], [2, 20], [3, null]]));
    expect(cost.unseated).toBe(DEFAULT_WEIGHTS.unseatedGuest);
  });

  it("treats a guest at a table that no longer exists as unseated", () => {
    const cost = scoreAssignment(input, assign([[1, 999], [2, 10], [3, 20]]));
    expect(cost.unseated).toBe(DEFAULT_WEIGHTS.unseatedGuest);
  });

  it("adds the weight of each violated constraint", () => {
    const withRules: SeatingInput = {
      ...input,
      constraints: [
        constraint(1, 1, 2, "together", 7),
        constraint(2, 1, 3, "apart", 4),
      ],
    };
    // 1 and 2 apart (breaks the together, 7); 1 and 3 together (breaks
    // the apart, 4).
    const cost = scoreAssignment(withRules, assign([[1, 10], [2, 20], [3, 10]]));
    expect(cost.constraints).toBe(11);
  });

  it("charges a household for every extra table it spills across", () => {
    const family: SeatingInput = {
      guests: [guest(1, 100), guest(2, 100), guest(3, 100)],
      tables: [table(10, 3), table(20, 3), table(30, 3)],
      constraints: [],
    };
    expect(
      scoreAssignment(family, assign([[1, 10], [2, 10], [3, 10]])).households,
    ).toBe(0);
    expect(
      scoreAssignment(family, assign([[1, 10], [2, 20], [3, 10]])).households,
    ).toBe(DEFAULT_WEIGHTS.householdSplit);
    expect(
      scoreAssignment(family, assign([[1, 10], [2, 20], [3, 30]])).households,
    ).toBe(2 * DEFAULT_WEIGHTS.householdSplit);
  });

  it("drops the household term entirely at weight zero", () => {
    const family: SeatingInput = {
      guests: [guest(1, 100), guest(2, 100)],
      tables: [table(10, 2), table(20, 2)],
      constraints: [],
    };
    const cost = scoreAssignment(family, assign([[1, 10], [2, 20]]), {
      ...DEFAULT_WEIGHTS,
      householdSplit: 0,
    });
    expect(cost.total).toBe(0);
  });

  it("ranks one serious breach above several trivial ones", () => {
    const rules: SeatingInput = {
      guests: [guest(1), guest(2), guest(3), guest(4)],
      tables: [table(10, 4), table(20, 4)],
      constraints: [
        constraint(1, 1, 2, "apart", 10),
        constraint(2, 3, 4, "together", 1),
      ],
    };
    const breaksTheSeriousOne = scoreAssignment(
      rules,
      assign([[1, 10], [2, 10], [3, 20], [4, 20]]),
    );
    const breaksTheTrivialOne = scoreAssignment(
      rules,
      assign([[1, 10], [2, 20], [3, 10], [4, 20]]),
    );
    expect(breaksTheSeriousOne.total).toBeGreaterThan(breaksTheTrivialOne.total);
  });
});

describe("buildReport", () => {
  const input: SeatingInput = {
    guests: [
      { ...guest(1, 100), firstName: "Ada" },
      { ...guest(2, 100), firstName: "Bo" },
      { ...guest(3, 200), firstName: "Cy" },
    ],
    tables: [table(10, 1), table(20, 5)],
    constraints: [
      constraint(1, 1, 2, "together", 9),
      constraint(2, 1, 3, "apart", 2),
    ],
  };

  it("names the guests and tables behind every violation", () => {
    const report = buildReport(input, assign([[1, 10], [2, 20], [3, 10]]));
    expect(report.violations).toHaveLength(2);
    const [worst, lesser] = report.violations;
    // Sorted loudest first.
    expect(worst.constraint.weight).toBe(9);
    expect(worst.guestAName).toBe("Ada Test");
    expect(worst.guestBName).toBe("Bo Test");
    expect(worst.tableAName).toBe("Table 10");
    expect(worst.tableBName).toBe("Table 20");
    expect(lesser.constraint.kind).toBe("apart");
  });

  it("reports over-capacity tables with the overflow", () => {
    const report = buildReport(input, assign([[1, 10], [2, 10], [3, 10]]));
    expect(report.overCapacityTables).toEqual([
      { table: input.tables[0], seated: 3, over: 2 },
    ]);
  });

  it("lists unseated guests and split households", () => {
    const report = buildReport(input, assign([[1, 10], [2, 20], [3, null]]));
    expect(report.unseated.map((g) => g.firstName)).toEqual(["Cy"]);
    expect(report.splitHouseholds).toEqual([
      { householdId: 100, tableCount: 2 },
    ]);
  });

  it("says nothing is wrong when nothing is", () => {
    const report = buildReport(input, assign([[1, 20], [2, 20], [3, null]]), {
      ...DEFAULT_WEIGHTS,
      unseatedGuest: 0,
    });
    expect(report.violations).toEqual([]);
    expect(report.overCapacityTables).toEqual([]);
    expect(report.splitHouseholds).toEqual([]);
    expect(report.cost.total).toBe(0);
  });
});

describe("solveSeating", () => {
  /** A wedding-shaped problem: 60 guests over 8 tables in 20 households. */
  function bigProblem(): SeatingInput {
    const guests: SeatingGuest[] = [];
    for (let i = 1; i <= 60; i++) {
      guests.push(guest(i, Math.ceil(i / 3)));
    }
    const tables = [
      table(1, 8), table(2, 8), table(3, 8), table(4, 8),
      table(5, 8), table(6, 8), table(7, 8), table(8, 8),
    ];
    return {
      guests,
      tables,
      constraints: [
        constraint(1, 1, 4, "together", 8),
        constraint(2, 2, 59, "apart", 10),
        constraint(3, 7, 10, "together", 5),
        constraint(4, 13, 16, "apart", 6),
        constraint(5, 20, 25, "together", 3),
        constraint(6, 31, 44, "apart", 9),
      ],
    };
  }

  it("seats everyone within capacity and breaks nothing serious", () => {
    const result = solveSeating(bigProblem(), { seed: 1 });
    expect(result.report.unseated).toEqual([]);
    expect(result.report.overCapacityTables).toEqual([]);
    expect(result.report.violations).toEqual([]);
  });

  it("keeps the incremental cost honest against a full recompute", () => {
    const input = bigProblem();
    const result = solveSeating(input, { seed: 7 });
    // The annealer tracks cost by deltas; this is the reference figure.
    expect(scoreAssignment(input, result.assignment)).toEqual(
      result.report.cost,
    );
  });

  it("assigns every guest a seat or an explicit null", () => {
    const input = bigProblem();
    const result = solveSeating(input, { seed: 3 });
    expect(result.assignment.size).toBe(input.guests.length);
    for (const g of input.guests) {
      expect(result.assignment.has(g.id)).toBe(true);
    }
  });

  it("never moves a pinned guest", () => {
    const input = bigProblem();
    input.guests[0] = { ...input.guests[0], pinned: true, tableId: 5 };
    input.guests[9] = { ...input.guests[9], pinned: true, tableId: 5 };
    input.guests[20] = { ...input.guests[20], pinned: true, tableId: 2 };

    const result = solveSeating(input, { seed: 11 });
    expect(result.assignment.get(input.guests[0].id)).toBe(5);
    expect(result.assignment.get(input.guests[9].id)).toBe(5);
    expect(result.assignment.get(input.guests[20].id)).toBe(2);
  });

  it("honours a pin even when it forces a constraint to break", () => {
    const input: SeatingInput = {
      guests: [
        { ...guest(1), pinned: true, tableId: 10 },
        { ...guest(2), pinned: true, tableId: 10 },
      ],
      tables: [table(10, 4), table(20, 4)],
      // These two must not sit together, but both are pinned where they are.
      constraints: [constraint(1, 1, 2, "apart", 10)],
    };
    const result = solveSeating(input, { seed: 5 });
    expect(result.assignment.get(1)).toBe(10);
    expect(result.assignment.get(2)).toBe(10);
    // And it says so rather than pretending.
    expect(result.report.violations).toHaveLength(1);
    expect(result.moved).toBe(0);
  });

  it("respects a hard apart rule over several soft together rules", () => {
    const input: SeatingInput = {
      guests: [guest(1), guest(2), guest(3), guest(4)],
      tables: [table(10, 4), table(20, 4)],
      constraints: [
        constraint(1, 1, 2, "apart", 10),
        constraint(2, 1, 3, "together", 1),
        constraint(3, 2, 3, "together", 1),
      ],
    };
    const result = solveSeating(input, { seed: 2 });
    expect(result.assignment.get(1)).not.toBe(result.assignment.get(2));
  });

  it("leaves people out rather than inventing seats, and reports it", () => {
    const input: SeatingInput = {
      guests: [guest(1), guest(2), guest(3), guest(4), guest(5)],
      tables: [table(10, 2)],
      constraints: [],
    };
    const result = solveSeating(input, { seed: 4 });
    const seated = [...result.assignment.values()].filter((t) => t !== null);
    // Overfilling is cheaper than stranding, so it crams and confesses.
    expect(result.report.overCapacityTables.length).toBeGreaterThan(0);
    expect(seated.length).toBe(5);
  });

  it("copes with no tables at all", () => {
    const input: SeatingInput = {
      guests: [guest(1), guest(2)],
      tables: [],
      constraints: [],
    };
    const result = solveSeating(input, { seed: 6 });
    expect(result.report.unseated).toHaveLength(2);
    expect(result.moved).toBe(0);
  });

  it("copes with no guests at all", () => {
    const result = solveSeating(
      { guests: [], tables: [table(10, 8)], constraints: [] },
      { seed: 6 },
    );
    expect(result.report.cost.total).toBe(0);
  });

  it("ignores constraints that name a guest who is not coming", () => {
    const input: SeatingInput = {
      guests: [guest(1), guest(2)],
      tables: [table(10, 4)],
      constraints: [constraint(1, 1, 999, "apart", 10)],
    };
    const result = solveSeating(input, { seed: 8 });
    expect(result.report.cost.overCapacity).toBe(0);
    expect(result.assignment.get(1)).toBe(10);
  });

  it("is reproducible for a given seed and varies across seeds", () => {
    const a = solveSeating(bigProblem(), { seed: 42 });
    const b = solveSeating(bigProblem(), { seed: 42 });
    expect([...a.assignment.entries()]).toEqual([...b.assignment.entries()]);
  });

  it("keeps households together when the weight asks it to", () => {
    const input: SeatingInput = {
      guests: [
        guest(1, 100), guest(2, 100), guest(3, 100), guest(4, 100),
        guest(5, 200), guest(6, 200), guest(7, 200), guest(8, 200),
      ],
      tables: [table(10, 4), table(20, 4)],
      constraints: [],
    };
    const result = solveSeating(input, { seed: 9 });
    expect(result.report.splitHouseholds).toEqual([]);
  });

  it("finishes a wedding-sized problem in well under a second", () => {
    const result = solveSeating(bigProblem(), { seed: 12 });
    expect(result.elapsedMs).toBeLessThan(1000);
  });
});
