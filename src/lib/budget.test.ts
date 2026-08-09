import { describe, expect, it } from "vitest";
import {
  activeTierIndex,
  compareBudgets,
  compromiseOrder,
  computeBudget,
  computeLine,
  cumulativeSavings,
  effectiveCosts,
  isContested,
  marginalAdultCents,
  marginalChildCents,
  NO_CHOICE,
  resolveChildRate,
  tierStops,
  type BudgetItem,
  type ItemChoice,
} from "./budget";

function item(overrides: Partial<BudgetItem> = {}): BudgetItem {
  return {
    id: 1,
    category: "Food & drink",
    name: "Catering",
    fixedCostCents: 0,
    perHeadCostCents: 16_500,
    perChildCostCents: 8_000,
    priorityA: 5,
    priorityB: 5,
    notes: null,
    options: [],
    ...overrides,
  };
}

const COUNTS = { adults: 80, children: 10 };

describe("resolveChildRate", () => {
  it("charges children at the adult rate when no child rate is set", () => {
    expect(resolveChildRate(16_500, null)).toBe(16_500);
  });

  it("uses the child rate when set, including a free-for-children zero", () => {
    expect(resolveChildRate(16_500, 8_000)).toBe(8_000);
    expect(resolveChildRate(16_500, 0)).toBe(0);
  });
});

describe("computeLine", () => {
  it("splits fixed and per-head costs by age bracket", () => {
    const line = computeLine(
      item({ fixedCostCents: 50_000 }),
      NO_CHOICE,
      COUNTS,
    );
    expect(line.adultsCents).toBe(16_500 * 80);
    expect(line.childrenCents).toBe(8_000 * 10);
    expect(line.totalCents).toBe(50_000 + 1_320_000 + 80_000);
    expect(line.scalesWithGuests).toBe(true);
  });

  it("leaves a purely fixed item unchanged by the guest count", () => {
    const celebrant = item({
      name: "Celebrant",
      fixedCostCents: 120_000,
      perHeadCostCents: 0,
      perChildCostCents: null,
    });
    const few = computeLine(celebrant, NO_CHOICE, { adults: 10, children: 0 });
    const many = computeLine(celebrant, NO_CHOICE, { adults: 200, children: 40 });
    expect(few.totalCents).toBe(120_000);
    expect(many.totalCents).toBe(120_000);
    expect(few.scalesWithGuests).toBe(false);
  });

  it("charges children as adults when the item has no child rate", () => {
    const line = computeLine(
      item({ perChildCostCents: null }),
      NO_CHOICE,
      COUNTS,
    );
    expect(line.childrenCents).toBe(16_500 * 10);
  });

  it("never charges for infants (they are not in the counts)", () => {
    const line = computeLine(item(), NO_CHOICE, { adults: 80, children: 10 });
    expect(line.totalCents).toBe(16_500 * 80 + 8_000 * 10);
  });

  it("zeroes an excluded item but keeps its rates visible", () => {
    const line = computeLine(
      item({ fixedCostCents: 50_000 }),
      { itemOptionId: null, excluded: true },
      COUNTS,
    );
    expect(line.totalCents).toBe(0);
    expect(line.adultsCents).toBe(0);
    expect(line.perAdultCents).toBe(16_500);
  });

  it("keeps every value an integer number of cents", () => {
    const line = computeLine(
      item({ fixedCostCents: 99_999, perHeadCostCents: 1_999 }),
      NO_CHOICE,
      { adults: 77, children: 3 },
    );
    for (const value of [
      line.fixedCents,
      line.adultsCents,
      line.childrenCents,
      line.totalCents,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(line.totalCents).toBe(99_999 + 1_999 * 77 + 8_000 * 3);
  });

  it("rejects fractional or negative guest counts", () => {
    expect(() => computeLine(item(), NO_CHOICE, { adults: 1.5, children: 0 })).toThrow(
      /whole numbers/,
    );
    expect(() => computeLine(item(), NO_CHOICE, { adults: -1, children: 0 })).toThrow(
      /negative/,
    );
  });
});

describe("effectiveCosts", () => {
  const photographer = item({
    id: 7,
    name: "Photographer",
    fixedCostCents: 550_000,
    perHeadCostCents: 0,
    perChildCostCents: null,
    options: [
      { id: 71, label: "Half day", fixedCostCents: 380_000, perHeadCostCents: 0, perChildCostCents: null, sortOrder: 0 },
      { id: 72, label: "Full day", fixedCostCents: 550_000, perHeadCostCents: 0, perChildCostCents: null, sortOrder: 1 },
    ],
  });

  it("uses base costs when no tier is chosen", () => {
    expect(effectiveCosts(photographer, NO_CHOICE).fixedCents).toBe(550_000);
  });

  it("lets a chosen tier override the base costs entirely", () => {
    const costs = effectiveCosts(photographer, {
      itemOptionId: 71,
      excluded: false,
    });
    expect(costs.fixedCents).toBe(380_000);
    expect(costs.option?.label).toBe("Half day");
  });

  it("falls back to base costs if the chosen tier no longer exists", () => {
    const costs = effectiveCosts(photographer, {
      itemOptionId: 999,
      excluded: false,
    });
    expect(costs.fixedCents).toBe(550_000);
    expect(costs.option).toBeNull();
  });
});

describe("computeBudget", () => {
  const items = [
    item({ id: 1, name: "Catering", category: "Food & drink" }),
    item({
      id: 2,
      name: "Celebrant",
      category: "Ceremony",
      fixedCostCents: 120_000,
      perHeadCostCents: 0,
      perChildCostCents: null,
    }),
    item({
      id: 3,
      name: "Favours",
      category: "Styling",
      fixedCostCents: 0,
      perHeadCostCents: 800,
      perChildCostCents: 800,
    }),
  ];

  it("totals every line and splits fixed from variable", () => {
    const budget = computeBudget(items, new Map(), COUNTS);
    const catering = 16_500 * 80 + 8_000 * 10;
    const favours = 800 * 90;
    expect(budget.totalCents).toBe(catering + 120_000 + favours);
    expect(budget.fixedTotalCents).toBe(120_000);
    expect(budget.variableTotalCents).toBe(catering + favours);
  });

  it("recalculates the whole budget from a single guest-count change", () => {
    const at90 = computeBudget(items, new Map(), { adults: 80, children: 10 });
    const at60 = computeBudget(items, new Map(), { adults: 55, children: 5 });
    expect(at60.totalCents).toBeLessThan(at90.totalCents);
    // Fixed costs are untouched by the change.
    expect(at60.fixedTotalCents).toBe(at90.fixedTotalCents);
  });

  it("drops excluded items from the total but keeps them in the lines", () => {
    const choices = new Map<number, ItemChoice>([
      [3, { itemOptionId: null, excluded: true }],
    ]);
    const budget = computeBudget(items, choices, COUNTS);
    expect(budget.lines).toHaveLength(3);
    expect(budget.totalCents).toBe(16_500 * 80 + 8_000 * 10 + 120_000);
  });

  it("groups by category, largest first", () => {
    const budget = computeBudget(items, new Map(), COUNTS);
    expect(budget.categories[0].category).toBe("Food & drink");
    expect(budget.categories.map((c) => c.totalCents)).toEqual(
      [...budget.categories.map((c) => c.totalCents)].sort((a, b) => b - a),
    );
  });

  it("reports cost per guest as whole cents", () => {
    const budget = computeBudget(items, new Map(), { adults: 3, children: 0 });
    expect(Number.isInteger(budget.perGuestCents)).toBe(true);
    expect(budget.perGuestCents).toBe(
      Math.round(budget.totalCents / 3),
    );
  });

  it("survives a guest count of zero", () => {
    const budget = computeBudget(items, new Map(), { adults: 0, children: 0 });
    expect(budget.totalCents).toBe(120_000);
    expect(budget.perGuestCents).toBe(0);
  });

  it("prices one more adult and one more child", () => {
    const budget = computeBudget(items, new Map(), COUNTS);
    expect(marginalAdultCents(budget)).toBe(16_500 + 800);
    expect(marginalChildCents(budget)).toBe(8_000 + 800);

    // Adding a guest must move the total by exactly the marginal cost.
    const plusOne = computeBudget(items, new Map(), {
      adults: COUNTS.adults + 1,
      children: COUNTS.children,
    });
    expect(plusOne.totalCents - budget.totalCents).toBe(
      marginalAdultCents(budget),
    );
  });

  it("excludes cut items from the marginal cost of a guest", () => {
    const choices = new Map<number, ItemChoice>([
      [3, { itemOptionId: null, excluded: true }],
    ]);
    const budget = computeBudget(items, choices, COUNTS);
    expect(marginalAdultCents(budget)).toBe(16_500);
  });
});

describe("tierStops", () => {
  const withMatchingBase = item({
    fixedCostCents: 550_000,
    perHeadCostCents: 0,
    perChildCostCents: null,
    options: [
      { id: 71, label: "Half day", fixedCostCents: 380_000, perHeadCostCents: 0, perChildCostCents: null, sortOrder: 0 },
      { id: 72, label: "Full day", fixedCostCents: 550_000, perHeadCostCents: 0, perChildCostCents: null, sortOrder: 1 },
    ],
  });

  it("lists only the tiers when one of them reproduces the base costs", () => {
    expect(tierStops(withMatchingBase).map((s) => s.label)).toEqual([
      "Half day",
      "Full day",
    ]);
  });

  it("adds a base stop when no tier matches the base costs", () => {
    const odd = item({
      fixedCostCents: 500_000,
      perHeadCostCents: 0,
      perChildCostCents: null,
      options: withMatchingBase.options,
    });
    expect(tierStops(odd).map((s) => s.label)).toEqual([
      "Base",
      "Half day",
      "Full day",
    ]);
  });

  it("orders tiers by sortOrder, not insertion order", () => {
    const shuffled = item({
      options: [
        { id: 2, label: "Second", fixedCostCents: 200, perHeadCostCents: 0, perChildCostCents: null, sortOrder: 1 },
        { id: 1, label: "First", fixedCostCents: 100, perHeadCostCents: 0, perChildCostCents: null, sortOrder: 0 },
      ],
    });
    expect(tierStops(shuffled).map((s) => s.label)).toEqual([
      "Base",
      "First",
      "Second",
    ]);
  });

  it("points the slider at the chosen tier, or the base-equivalent one", () => {
    expect(activeTierIndex(withMatchingBase, { itemOptionId: 71, excluded: false })).toBe(0);
    expect(activeTierIndex(withMatchingBase, NO_CHOICE)).toBe(1);
  });
});

describe("compromiseOrder", () => {
  const lines = computeBudget(
    [
      item({ id: 1, name: "Catering", priorityA: 5, priorityB: 5, fixedCostCents: 100 }),
      item({ id: 2, name: "Videographer", priorityA: 4, priorityB: 1, fixedCostCents: 420_000, perHeadCostCents: 0, perChildCostCents: null }),
      item({ id: 3, name: "Favours", priorityA: 2, priorityB: 1, fixedCostCents: 0, perHeadCostCents: 800, perChildCostCents: 800 }),
      item({ id: 4, name: "Photo booth", priorityA: 1, priorityB: 4, fixedCostCents: 120_000, perHeadCostCents: 0, perChildCostCents: null }),
    ],
    new Map(),
    COUNTS,
  ).lines;

  it("surfaces the cheapest-to-lose items first: low priority, high cost", () => {
    const order = compromiseOrder(lines).map((l) => l.item.name);
    // Favours has the lowest combined priority (3), so it leads. Videographer
    // and Photo booth are tied on 5, so the dearer of the two comes first.
    expect(order).toEqual([
      "Favours",
      "Videographer",
      "Photo booth",
      "Catering",
    ]);
  });

  it("sinks already-excluded lines to the bottom", () => {
    const withCut = computeBudget(
      lines.map((l) => l.item),
      new Map([[2, { itemOptionId: null, excluded: true }]]),
      COUNTS,
    ).lines;
    expect(compromiseOrder(withCut).at(-1)?.item.name).toBe("Videographer");
  });

  it("flags only the rows where you disagree by two or more", () => {
    const contested = lines.filter(isContested).map((l) => l.item.name);
    expect(contested).toEqual(["Videographer", "Photo booth"]);
  });
});

describe("cumulativeSavings", () => {
  const items = [
    item({ id: 1, name: "Favours", fixedCostCents: 10_000, perHeadCostCents: 0, perChildCostCents: null, priorityA: 1, priorityB: 2 }),
    item({ id: 2, name: "Videographer", fixedCostCents: 420_000, perHeadCostCents: 0, perChildCostCents: null, priorityA: 4, priorityB: 1 }),
    item({ id: 3, name: "Catering", fixedCostCents: 100_000, perHeadCostCents: 0, perChildCostCents: null, priorityA: 5, priorityB: 5 }),
  ];

  it("accumulates down the compromise order", () => {
    const ordered = compromiseOrder(computeBudget(items, new Map(), COUNTS).lines);
    expect(cumulativeSavings(ordered)).toEqual([10_000, 430_000, 530_000]);
  });

  it("adds nothing for lines already cut", () => {
    const budget = computeBudget(
      items,
      new Map([[2, { itemOptionId: null, excluded: true }]]),
      COUNTS,
    );
    const ordered = compromiseOrder(budget.lines);
    // Videographer sorts last once cut and contributes no further saving.
    expect(ordered.at(-1)?.item.name).toBe("Videographer");
    expect(cumulativeSavings(ordered).at(-1)).toBe(110_000);
  });

  it("returns an empty array for no lines", () => {
    expect(cumulativeSavings([])).toEqual([]);
  });
});

describe("compareBudgets", () => {
  const items = [
    item({ id: 1, name: "Catering" }),
    item({
      id: 2,
      name: "Music",
      category: "Entertainment",
      fixedCostCents: 280_000,
      perHeadCostCents: 0,
      perChildCostCents: null,
      options: [
        { id: 21, label: "DJ", fixedCostCents: 280_000, perHeadCostCents: 0, perChildCostCents: null, sortOrder: 0 },
        { id: 22, label: "Live band", fixedCostCents: 550_000, perHeadCostCents: 0, perChildCostCents: null, sortOrder: 1 },
      ],
    }),
  ];

  const dream = computeBudget(
    items,
    new Map([[2, { itemOptionId: 22, excluded: false }]]),
    { adults: 85, children: 9 },
  );
  const tighter = computeBudget(
    items,
    new Map([[2, { itemOptionId: null, excluded: true }]]),
    { adults: 62, children: 6 },
  );

  it("measures every delta against the first scenario", () => {
    const comparison = compareBudgets([dream, tighter]);
    expect(comparison.deltasCents[0]).toBe(0);
    expect(comparison.deltasCents[1]).toBe(
      tighter.totalCents - dream.totalCents,
    );
    expect(comparison.deltasCents[1]).toBeLessThan(0);
  });

  it("reports per-line deltas, tier labels and exclusions", () => {
    const [catering, music] = compareBudgets([dream, tighter]).lines;
    expect(catering.deltasCents[1]).toBe(
      catering.totalsCents[1] - catering.totalsCents[0],
    );
    expect(music.optionLabels).toEqual(["Live band", null]);
    expect(music.excluded).toEqual([false, true]);
    expect(music.differs).toBe(true);
  });

  it("marks a line as unchanged when the scenarios agree", () => {
    const same = compareBudgets([dream, dream]);
    expect(same.lines.every((l) => !l.differs)).toBe(true);
    expect(same.deltasCents).toEqual([0, 0]);
  });

  it("handles three scenarios", () => {
    const middle = computeBudget(items, new Map(), { adults: 70, children: 8 });
    const comparison = compareBudgets([dream, middle, tighter]);
    expect(comparison.totalsCents).toHaveLength(3);
    expect(comparison.lines[0].deltasCents).toHaveLength(3);
  });

  it("returns an empty comparison for no scenarios", () => {
    expect(compareBudgets([]).lines).toEqual([]);
  });
});
