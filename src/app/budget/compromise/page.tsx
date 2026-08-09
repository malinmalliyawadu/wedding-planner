import { PriorityBars } from "@/components/priority-bars";
import { EmptyState, PageHeader } from "@/components/ui";
import {
  compromiseOrder,
  computeBudget,
  cumulativeSavings,
  isContested,
  type GuestCounts,
  type ItemChoice,
} from "@/lib/budget";
import { formatCentsWhole } from "@/lib/money";
import { getSettings } from "@/lib/queries";
import { BudgetTabs } from "../budget-tabs";
import {
  loadBudgetItems,
  loadScenarios,
  scenarioChoiceMap,
  scenarioCounts,
  countsFromGuestList,
} from "../queries";
import { CompromiseScenarioPicker } from "./scenario-select";

export const dynamic = "force-dynamic";

export default async function CompromisePage({
  searchParams,
}: PageProps<"/budget/compromise">) {
  const params = await searchParams;
  const [settings, items, scenarios, guestListCounts] = await Promise.all([
    getSettings(),
    loadBudgetItems(),
    loadScenarios(),
    countsFromGuestList(),
  ]);

  const requestedId = typeof params.s === "string" ? Number(params.s) : NaN;
  const scenario = scenarios.find((s) => s.id === requestedId) ?? null;

  const counts: GuestCounts = scenario
    ? scenarioCounts(scenario)
    : guestListCounts;
  const choices: Map<number, ItemChoice> = scenario
    ? scenarioChoiceMap(scenario)
    : new Map();

  const budget = computeBudget(items, choices, counts);
  const ordered = compromiseOrder(budget.lines);
  const contested = ordered.filter(isContested);

  // The order is already "least wanted first", so the running column
  // answers "how far down this list do we have to go?".
  const running = cumulativeSavings(ordered);
  const withRunning = ordered.map((line, i) => ({
    line,
    cumulativeCents: running[i],
  }));

  const alreadyCut = budget.lines.filter((l) => l.excluded);

  return (
    <>
      <PageHeader eyebrow="What it costs" title="Compromise">
        <BudgetTabs />
        <p className="mt-4 max-w-2xl text-sm text-ink-soft">
          Every item ranked by how much the two of you want it, least wanted
          first, and by cost within each rank. The running column is what you
          would save by cutting everything down to that row.
        </p>
        {scenarios.length > 0 && (
          <div className="mt-4">
            <CompromiseScenarioPicker
              scenarios={scenarios.map((s) => ({ id: s.id, name: s.name }))}
              selected={scenario?.id ?? null}
              guestListLabel={`Your guest list (${guestListCounts.adults} + ${guestListCounts.children})`}
            />
          </div>
        )}
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing to weigh up yet"
          hint="Add budget items with priorities and this view will rank them."
        />
      ) : (
        <>
          {contested.length > 0 && (
            <section className="mb-8 rounded-lg border border-brass/30 bg-brass-tint/40 p-5">
              <h2 className="eyebrow text-brass">
                Worth talking about ({contested.length})
              </h2>
              <p className="mt-1.5 text-sm text-ink-soft">
                You two are two or more points apart on these. Together they
                come to{" "}
                <span className="figures font-medium text-ink">
                  {formatCentsWhole(
                    contested.reduce((sum, l) => sum + l.totalCents, 0),
                  )}
                </span>
                .
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {contested.map((line) => (
                  <li
                    key={line.item.id}
                    className="inline-flex items-center gap-2 rounded-full border border-brass/30 bg-card px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium">{line.item.name}</span>
                    <PriorityBars
                      priorityA={line.item.priorityA}
                      priorityB={line.item.priorityB}
                      nameA={settings.partnerAName}
                      nameB={settings.partnerBName}
                    />
                    <span className="figures text-ink-soft">
                      {formatCentsWhole(line.totalCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="overflow-x-auto rounded-lg border border-hairline bg-card shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                    Item
                  </th>
                  <th className="eyebrow px-3 py-3 font-semibold text-ink-faint">
                    {settings.partnerAName} / {settings.partnerBName}
                  </th>
                  <th className="eyebrow px-3 py-3 text-right font-semibold text-ink-faint">
                    Combined
                  </th>
                  <th className="eyebrow px-4 py-3 text-right font-semibold text-ink-faint">
                    Cost
                  </th>
                  <th className="eyebrow px-4 py-3 text-right font-semibold text-ink-faint">
                    Cut to here
                  </th>
                </tr>
              </thead>
              <tbody>
                {withRunning.map(({ line, cumulativeCents }) => {
                  const flagged = isContested(line);
                  return (
                    <tr
                      key={line.item.id}
                      className={`border-b border-hairline/60 last:border-0 transition-colors duration-150 hover:bg-brass-tint/25 ${
                        flagged ? "bg-brass-tint/30" : ""
                      } ${line.excluded ? "opacity-45" : ""}`}
                    >
                      <td className="px-4 py-2.5">
                        <span
                          className={`font-medium ${line.excluded ? "line-through" : ""}`}
                        >
                          {line.item.name}
                        </span>
                        {flagged && (
                          <span className="ml-2 text-xs font-medium text-brass">
                            {line.priorityGap} apart
                          </span>
                        )}
                        <span className="block text-xs text-ink-faint">
                          {line.item.category}
                          {line.option && ` · ${line.option.label}`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <PriorityBars
                          priorityA={line.item.priorityA}
                          priorityB={line.item.priorityB}
                          nameA={settings.partnerAName}
                          nameB={settings.partnerBName}
                        />
                      </td>
                      <td className="figures px-3 py-2.5 text-right text-xs text-ink-soft">
                        {line.combinedPriority}/10
                      </td>
                      <td className="figures px-4 py-2.5 text-right font-medium">
                        {line.excluded ? (
                          <span className="text-xs font-normal text-madder">
                            Already cut
                          </span>
                        ) : (
                          formatCentsWhole(line.totalCents)
                        )}
                      </td>
                      <td className="figures px-4 py-2.5 text-right text-xs text-ink-soft">
                        {line.excluded ? "—" : formatCentsWhole(cumulativeCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-ink-soft">
            Total as modelled:{" "}
            <span className="figures">{formatCentsWhole(budget.totalCents)}</span>{" "}
            at <span className="figures">{counts.adults}</span> adults and{" "}
            <span className="figures">{counts.children}</span> children
            {alreadyCut.length > 0 && (
              <>
                {" "}
                · <span className="figures">{alreadyCut.length}</span> item
                {alreadyCut.length === 1 ? "" : "s"} already cut in this scenario
              </>
            )}
            .
          </p>
        </>
      )}
    </>
  );
}
