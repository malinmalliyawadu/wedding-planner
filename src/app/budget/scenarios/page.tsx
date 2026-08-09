import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { compareBudgets, computeBudget } from "@/lib/budget";
import { formatCentsWhole } from "@/lib/money";
import { BudgetTabs } from "../budget-tabs";
import {
  loadBudgetItems,
  loadScenarios,
  scenarioChoiceMap,
  scenarioCounts,
} from "../queries";
import { ScenarioPicker } from "./scenario-picker";

export const dynamic = "force-dynamic";

/** Signed money: "+$1,200" / "-$3,400" / "—" for no change. */
function Delta({ cents }: { cents: number }) {
  if (cents === 0) return <span className="text-ink-faint">—</span>;
  const up = cents > 0;
  return (
    <span className={`figures ${up ? "text-madder" : "text-fern"}`}>
      {up ? "+" : "−"}
      {formatCentsWhole(Math.abs(cents))}
    </span>
  );
}

export default async function ScenariosPage({
  searchParams,
}: PageProps<"/budget/scenarios">) {
  const params = await searchParams;
  const [items, scenarios] = await Promise.all([
    loadBudgetItems(),
    loadScenarios(),
  ]);

  const requested = (Array.isArray(params.s) ? params.s : params.s ? [params.s] : [])
    .map(Number)
    .filter((id) => scenarios.some((s) => s.id === id));

  // Default to the first two scenarios so the page is never empty.
  const selectedIds =
    requested.length > 0 ? requested.slice(0, 3) : scenarios.slice(0, 2).map((s) => s.id);

  const selected = selectedIds
    .map((id) => scenarios.find((s) => s.id === id))
    .filter((s) => s !== undefined);

  const budgets = selected.map((scenario) =>
    computeBudget(items, scenarioChoiceMap(scenario), scenarioCounts(scenario)),
  );
  const comparison = compareBudgets(budgets);
  const changedLines = comparison.lines.filter((l) => l.differs);

  return (
    <>
      <PageHeader eyebrow="What it costs" title="Compare scenarios">
        <BudgetTabs />
      </PageHeader>

      {scenarios.length === 0 ? (
        <EmptyState
          title="No saved scenarios yet"
          hint="Set the guest count and tiers you want in the modeller, then save it as a named scenario. Come back here to put two or three side by side."
          action={
            <Link
              href="/budget"
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-spine-raised"
            >
              Open the modeller
            </Link>
          }
        />
      ) : (
        <>
          <ScenarioPicker
            scenarios={scenarios.map((s) => ({ id: s.id, name: s.name }))}
            selected={selectedIds}
          />

          {selected.length < 2 ? (
            <p className="mt-8 rounded-lg border border-dashed border-hairline-strong bg-card/60 px-6 py-10 text-center text-sm text-ink-soft">
              Pick a second scenario to compare against.
            </p>
          ) : (
            <>
              {/* Headline totals, measured against the first column. Each
                  card keeps a floor width so the figures never squash;
                  the row scrolls instead. */}
              <section className="mt-6 overflow-x-auto rounded-lg border border-hairline">
                <div
                  className="grid min-w-fit gap-px bg-hairline"
                  style={{
                    gridTemplateColumns: `repeat(${selected.length}, minmax(13rem, 1fr))`,
                  }}
                >
                {selected.map((scenario, i) => (
                  <div key={scenario.id} className="bg-card px-5 py-5">
                    <p className="eyebrow text-brass">
                      {i === 0 ? "Baseline" : `Option ${i + 1}`}
                    </p>
                    <h2 className="mt-1 font-display text-lg leading-snug">
                      {scenario.name}
                    </h2>
                    <p className="figures mt-3 text-3xl whitespace-nowrap">
                      {formatCentsWhole(comparison.totalsCents[i])}
                    </p>
                    <p className="mt-1 text-xs">
                      {i === 0 ? (
                        <span className="text-ink-faint">
                          everything else is measured from here
                        </span>
                      ) : (
                        <Delta cents={comparison.deltasCents[i]} />
                      )}
                    </p>
                    <p className="mt-3 border-t border-hairline pt-2.5 text-xs text-ink-soft">
                      <span className="figures">{scenario.adultCount}</span>{" "}
                      adults ·{" "}
                      <span className="figures">{scenario.childCount}</span>{" "}
                      children ·{" "}
                      <span className="figures">
                        {formatCentsWhole(budgets[i].perGuestCents)}
                      </span>{" "}
                      each
                    </p>
                    {scenario.notes && (
                      <p className="mt-2 text-xs text-ink-faint italic">
                        {scenario.notes}
                      </p>
                    )}
                  </div>
                ))}
                </div>
              </section>

              {/* Line by line. Unchanged lines are dimmed, not hidden: the
                  point is to see what a scenario leaves alone as well. */}
              <div className="mt-8 overflow-x-auto rounded-lg border border-hairline bg-card shadow-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left">
                      <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                        Item
                      </th>
                      {selected.map((scenario, i) => (
                        <th
                          key={scenario.id}
                          className="eyebrow min-w-32 px-4 py-3 text-right font-semibold text-ink-faint"
                        >
                          {scenario.name}
                          {i > 0 && (
                            <span className="ml-1 font-normal normal-case opacity-60">
                              vs base
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.lines.map((line) => (
                      <tr
                        key={line.itemId}
                        className={`border-b border-hairline/60 last:border-0 ${
                          line.differs ? "" : "text-ink-faint"
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <span
                            className={line.differs ? "font-medium" : undefined}
                          >
                            {line.name}
                          </span>
                          <span className="block text-xs text-ink-faint">
                            {line.category}
                          </span>
                        </td>
                        {selected.map((scenario, i) => (
                          <td
                            key={scenario.id}
                            className="px-4 py-2.5 text-right"
                          >
                            {line.excluded[i] ? (
                              <span className="text-xs text-madder">Cut</span>
                            ) : (
                              <span className="figures">
                                {formatCentsWhole(line.totalsCents[i])}
                              </span>
                            )}
                            {line.optionLabels[i] && (
                              <span className="block text-xs text-ink-faint">
                                {line.optionLabels[i]}
                              </span>
                            )}
                            {i > 0 && line.deltasCents[i] !== 0 && (
                              <span className="block text-xs">
                                <Delta cents={line.deltasCents[i]} />
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-hairline-strong">
                      <td className="px-4 py-3 text-sm font-medium">Total</td>
                      {selected.map((scenario, i) => (
                        <td key={scenario.id} className="px-4 py-3 text-right">
                          <span className="figures text-base font-medium">
                            {formatCentsWhole(comparison.totalsCents[i])}
                          </span>
                          {i > 0 && (
                            <span className="block text-xs">
                              <Delta cents={comparison.deltasCents[i]} />
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="mt-3 text-xs text-ink-soft">
                <span className="figures">{changedLines.length}</span> of{" "}
                <span className="figures">{comparison.lines.length}</span> lines
                differ between these scenarios.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
