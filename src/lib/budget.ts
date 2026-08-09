/**
 * Budget maths. Pure functions, integer NZD cents throughout - no floats
 * anywhere, including intermediate values. This module is the single
 * source of truth for what a wedding costs at a given guest count.
 *
 * The fixed / per-head split is the core idea: catering, drinks, favours
 * and stationery scale with the guest count, while the celebrant,
 * photographer and attire do not. Storing both components means one
 * guest-count change recalculates the entire budget correctly.
 *
 * Age brackets: adults pay perHeadCostCents. Children pay
 * perChildCostCents when it is set; null means "charge as an adult".
 * Infants are never charged and are not counted.
 */

export type BudgetOption = {
  id: number;
  label: string;
  fixedCostCents: number;
  perHeadCostCents: number;
  perChildCostCents: number | null;
  sortOrder: number;
};

export type BudgetItem = {
  id: number;
  category: string;
  name: string;
  fixedCostCents: number;
  perHeadCostCents: number;
  perChildCostCents: number | null;
  priorityA: number;
  priorityB: number;
  notes: string | null;
  options: BudgetOption[];
};

/**
 * How a scenario overrides one item. No choice at all means "include the
 * item at its base costs".
 */
export type ItemChoice = {
  itemOptionId: number | null;
  excluded: boolean;
};

export type GuestCounts = {
  adults: number;
  children: number;
};

export type BudgetLine = {
  item: BudgetItem;
  /** The selected tier, or null when the item is at its base costs. */
  option: BudgetOption | null;
  excluded: boolean;
  /** Costs in force for this line, after any tier override. */
  fixedCents: number;
  perAdultCents: number;
  perChildCents: number;
  /** perAdultCents x adults, and perChildCents x children. */
  adultsCents: number;
  childrenCents: number;
  totalCents: number;
  /** True when the line moves at all with the guest count. */
  scalesWithGuests: boolean;
  combinedPriority: number;
  /** How far apart the two of you are on this item (0-4). */
  priorityGap: number;
};

export type Budget = {
  lines: BudgetLine[];
  totalCents: number;
  /** The part of the total that does not move with the guest count. */
  fixedTotalCents: number;
  /** The part that does. */
  variableTotalCents: number;
  categories: Array<{ category: string; totalCents: number }>;
  counts: GuestCounts;
  /** Total cost divided by chargeable heads, rounded to the nearest cent. */
  perGuestCents: number;
};

export const NO_CHOICE: ItemChoice = { itemOptionId: null, excluded: false };

/** Children are charged at the adult rate unless a child rate is set. */
export function resolveChildRate(
  perHeadCostCents: number,
  perChildCostCents: number | null,
): number {
  return perChildCostCents ?? perHeadCostCents;
}

/** The costs in force for an item once a tier choice is applied. */
export function effectiveCosts(
  item: BudgetItem,
  choice: ItemChoice = NO_CHOICE,
): {
  option: BudgetOption | null;
  fixedCents: number;
  perAdultCents: number;
  perChildCents: number;
} {
  const option =
    choice.itemOptionId === null
      ? null
      : (item.options.find((o) => o.id === choice.itemOptionId) ?? null);

  const source = option ?? item;
  return {
    option,
    fixedCents: source.fixedCostCents,
    perAdultCents: source.perHeadCostCents,
    perChildCents: resolveChildRate(
      source.perHeadCostCents,
      source.perChildCostCents,
    ),
  };
}

export function computeLine(
  item: BudgetItem,
  choice: ItemChoice = NO_CHOICE,
  counts: GuestCounts,
): BudgetLine {
  assertCounts(counts);
  const { option, fixedCents, perAdultCents, perChildCents } = effectiveCosts(
    item,
    choice,
  );

  const excluded = choice.excluded;
  const adultsCents = excluded ? 0 : perAdultCents * counts.adults;
  const childrenCents = excluded ? 0 : perChildCents * counts.children;
  const totalCents = excluded ? 0 : fixedCents + adultsCents + childrenCents;

  return {
    item,
    option,
    excluded,
    fixedCents,
    perAdultCents,
    perChildCents,
    adultsCents,
    childrenCents,
    totalCents,
    scalesWithGuests: perAdultCents > 0 || perChildCents > 0,
    combinedPriority: item.priorityA + item.priorityB,
    priorityGap: Math.abs(item.priorityA - item.priorityB),
  };
}

export function computeBudget(
  items: BudgetItem[],
  choices: ReadonlyMap<number, ItemChoice>,
  counts: GuestCounts,
): Budget {
  const lines = items.map((item) =>
    computeLine(item, choices.get(item.id) ?? NO_CHOICE, counts),
  );

  let totalCents = 0;
  let fixedTotalCents = 0;
  let variableTotalCents = 0;
  const byCategory = new Map<string, number>();

  for (const line of lines) {
    totalCents += line.totalCents;
    if (!line.excluded) {
      fixedTotalCents += line.fixedCents;
      variableTotalCents += line.adultsCents + line.childrenCents;
    }
    byCategory.set(
      line.item.category,
      (byCategory.get(line.item.category) ?? 0) + line.totalCents,
    );
  }

  const heads = counts.adults + counts.children;

  return {
    lines,
    totalCents,
    fixedTotalCents,
    variableTotalCents,
    categories: [...byCategory.entries()]
      .map(([category, cents]) => ({ category, totalCents: cents }))
      .sort((a, b) => b.totalCents - a.totalCents),
    counts,
    perGuestCents: heads === 0 ? 0 : Math.round(totalCents / heads),
  };
}

/**
 * What one more adult costs across the whole budget. This is the number
 * that actually decides whether the B-list gets invited.
 */
export function marginalAdultCents(budget: Budget): number {
  return budget.lines.reduce(
    (sum, line) => sum + (line.excluded ? 0 : line.perAdultCents),
    0,
  );
}

export function marginalChildCents(budget: Budget): number {
  return budget.lines.reduce(
    (sum, line) => sum + (line.excluded ? 0 : line.perChildCents),
    0,
  );
}

/* ---------------------------------------------------------------- tiers */

export type TierStop = {
  /** null for the item's own base costs, otherwise the tier. */
  option: BudgetOption | null;
  label: string;
  fixedCostCents: number;
  perHeadCostCents: number;
  perChildCostCents: number | null;
};

/**
 * The ordered stops for an item's tier slider. Base costs only appear as
 * their own stop when no tier reproduces them, so items whose base equals
 * one of their tiers (the common case) show a clean list of tiers.
 */
export function tierStops(item: BudgetItem): TierStop[] {
  const options = [...item.options].sort((a, b) => a.sortOrder - b.sortOrder);
  const stops: TierStop[] = options.map((option) => ({
    option,
    label: option.label,
    fixedCostCents: option.fixedCostCents,
    perHeadCostCents: option.perHeadCostCents,
    perChildCostCents: option.perChildCostCents,
  }));

  const baseIsATier = options.some(
    (o) =>
      o.fixedCostCents === item.fixedCostCents &&
      o.perHeadCostCents === item.perHeadCostCents &&
      resolveChildRate(o.perHeadCostCents, o.perChildCostCents) ===
        resolveChildRate(item.perHeadCostCents, item.perChildCostCents),
  );

  if (!baseIsATier) {
    stops.unshift({
      option: null,
      label: "Base",
      fixedCostCents: item.fixedCostCents,
      perHeadCostCents: item.perHeadCostCents,
      perChildCostCents: item.perChildCostCents,
    });
  }
  return stops;
}

/** Which stop a choice currently sits on. Falls back to the base stop. */
export function activeTierIndex(item: BudgetItem, choice: ItemChoice): number {
  const stops = tierStops(item);
  if (choice.itemOptionId !== null) {
    const i = stops.findIndex((s) => s.option?.id === choice.itemOptionId);
    if (i !== -1) return i;
  }
  const baseStop = stops.findIndex(
    (s) =>
      s.fixedCostCents === item.fixedCostCents &&
      s.perHeadCostCents === item.perHeadCostCents,
  );
  return baseStop === -1 ? 0 : baseStop;
}

/* ------------------------------------------------------------ compromise */

/**
 * Items ordered so the obvious cuts surface from the data: lowest
 * combined priority first, and within equal priority the most expensive
 * first. Excluded lines sort last - they are already cut.
 */
export function compromiseOrder(lines: BudgetLine[]): BudgetLine[] {
  return [...lines].sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    if (a.combinedPriority !== b.combinedPriority)
      return a.combinedPriority - b.combinedPriority;
    return b.totalCents - a.totalCents;
  });
}

/** Rows the two of you actually need to talk about. */
export function isContested(line: BudgetLine): boolean {
  return line.priorityGap >= 2;
}

/**
 * Running total of what cutting everything down to and including each row
 * would save, over lines already in compromise order. Lines that are
 * already cut contribute nothing - there is no saving left in them.
 */
export function cumulativeSavings(lines: BudgetLine[]): number[] {
  const running: number[] = [];
  lines.reduce((sum, line) => {
    const next = line.excluded ? sum : sum + line.totalCents;
    running.push(next);
    return next;
  }, 0);
  return running;
}

/* ------------------------------------------------------------ comparison */

export type LineDelta = {
  itemId: number;
  name: string;
  category: string;
  /** Total per scenario, in the order the scenarios were given. */
  totalsCents: number[];
  /** Difference from the first scenario, same order (first is always 0). */
  deltasCents: number[];
  /** The tier label in force per scenario, or null at base costs. */
  optionLabels: Array<string | null>;
  excluded: boolean[];
  /** True when the scenarios do not all agree on this line. */
  differs: boolean;
};

export type Comparison = {
  budgets: Budget[];
  lines: LineDelta[];
  totalsCents: number[];
  deltasCents: number[];
};

/**
 * Compare two or three scenarios line by line. The first scenario given
 * is the baseline every delta is measured against.
 */
export function compareBudgets(budgets: Budget[]): Comparison {
  if (budgets.length === 0) {
    return { budgets, lines: [], totalsCents: [], deltasCents: [] };
  }

  const baseline = budgets[0];
  const lines: LineDelta[] = baseline.lines.map((baseLine, index) => {
    const totalsCents = budgets.map((b) => b.lines[index].totalCents);
    return {
      itemId: baseLine.item.id,
      name: baseLine.item.name,
      category: baseLine.item.category,
      totalsCents,
      deltasCents: totalsCents.map((t) => t - totalsCents[0]),
      optionLabels: budgets.map((b) => b.lines[index].option?.label ?? null),
      excluded: budgets.map((b) => b.lines[index].excluded),
      differs: totalsCents.some((t) => t !== totalsCents[0]),
    };
  });

  const totalsCents = budgets.map((b) => b.totalCents);
  return {
    budgets,
    lines,
    totalsCents,
    deltasCents: totalsCents.map((t) => t - totalsCents[0]),
  };
}

function assertCounts(counts: GuestCounts): void {
  if (!Number.isInteger(counts.adults) || !Number.isInteger(counts.children)) {
    throw new Error("Guest counts must be whole numbers");
  }
  if (counts.adults < 0 || counts.children < 0) {
    throw new Error("Guest counts cannot be negative");
  }
}
