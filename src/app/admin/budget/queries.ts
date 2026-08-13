import { asc } from "drizzle-orm";
import { db } from "@/db";
import { budgetItems, guests, scenarios } from "@/db/schema";
import type { BudgetItem, GuestCounts, ItemChoice } from "@/lib/budget";

export type ScenarioRecord = {
  id: number;
  name: string;
  adultCount: number;
  childCount: number;
  notes: string | null;
  choices: Array<{
    budgetItemId: number;
    itemOptionId: number | null;
    excluded: boolean;
  }>;
};

/** Every budget item with its tiers, ready for the maths module. */
export async function loadBudgetItems(): Promise<BudgetItem[]> {
  const rows = await db.query.budgetItems.findMany({
    with: { options: true },
    orderBy: [asc(budgetItems.category), asc(budgetItems.name)],
  });

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    fixedCostCents: row.fixedCostCents,
    perHeadCostCents: row.perHeadCostCents,
    perChildCostCents: row.perChildCostCents,
    priorityA: row.priorityA,
    priorityB: row.priorityB,
    notes: row.notes,
    options: row.options.map((o) => ({
      id: o.id,
      label: o.label,
      fixedCostCents: o.fixedCostCents,
      perHeadCostCents: o.perHeadCostCents,
      perChildCostCents: o.perChildCostCents,
      sortOrder: o.sortOrder,
    })),
  }));
}

export async function loadScenarios(): Promise<ScenarioRecord[]> {
  const rows = await db.query.scenarios.findMany({
    with: { choices: true },
    orderBy: [asc(scenarios.id)],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    adultCount: row.adultCount,
    childCount: row.childCount,
    notes: row.notes,
    choices: row.choices.map((c) => ({
      budgetItemId: c.budgetItemId,
      itemOptionId: c.itemOptionId,
      excluded: c.excluded,
    })),
  }));
}

export function scenarioChoiceMap(
  scenario: ScenarioRecord,
): Map<number, ItemChoice> {
  return new Map(
    scenario.choices.map((c) => [
      c.budgetItemId,
      { itemOptionId: c.itemOptionId, excluded: c.excluded },
    ]),
  );
}

export function scenarioCounts(scenario: ScenarioRecord): GuestCounts {
  return { adults: scenario.adultCount, children: scenario.childCount };
}

/**
 * Guest counts implied by the actual list: everyone attending plus
 * everyone still to reply. Infants are free and so never counted.
 */
export async function countsFromGuestList(): Promise<GuestCounts> {
  const rows = await db
    .select({ ageBracket: guests.ageBracket, rsvpStatus: guests.rsvpStatus })
    .from(guests);

  const likely = rows.filter((g) => g.rsvpStatus !== "declined");
  return {
    adults: likely.filter((g) => g.ageBracket === "adult").length,
    children: likely.filter((g) => g.ageBracket === "child").length,
  };
}
