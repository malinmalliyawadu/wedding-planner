"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Plus, RotateCcw, Save, Undo2 } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { DeleteButton } from "@/components/delete-button";
import { PriorityBars } from "@/components/priority-bars";
import { Slider } from "@/components/slider";
import { Button, Field, inputClass } from "@/components/ui";
import {
  computeBudget,
  marginalAdultCents,
  marginalChildCents,
  NO_CHOICE,
  type BudgetItem,
  type GuestCounts,
  type ItemChoice,
} from "@/lib/budget";
import { formatCentsWhole } from "@/lib/money";
import { deleteBudgetItem, deleteScenario, saveScenario } from "./actions";
import { BudgetItemDialog } from "./budget-item-dialog";
import { TierSlider } from "./tier-slider";
import type { ScenarioRecord } from "./queries";

type Props = {
  items: BudgetItem[];
  scenarios: ScenarioRecord[];
  guestListCounts: GuestCounts;
  nameA: string;
  nameB: string;
};

/** Everything that makes up a scenario, for dirty-checking. */
type ModelState = {
  counts: GuestCounts;
  choices: Map<number, ItemChoice>;
};

export function BudgetModeller({
  items,
  scenarios,
  guestListCounts,
  nameA,
  nameB,
}: Props) {
  const router = useRouter();
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [counts, setCounts] = useState<GuestCounts>(guestListCounts);
  const [choices, setChoices] = useState<Map<number, ItemChoice>>(new Map());
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const budget = useMemo(
    () => computeBudget(items, choices, counts),
    [items, choices, counts],
  );

  const loaded = scenarios.find((s) => s.id === loadedId) ?? null;
  const dirty = loaded !== null && !matchesScenario(loaded, { counts, choices });

  function setChoice(itemId: number, patch: Partial<ItemChoice>) {
    setChoices((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId) ?? NO_CHOICE;
      const merged = { ...current, ...patch };
      if (merged.itemOptionId === null && !merged.excluded) next.delete(itemId);
      else next.set(itemId, merged);
      return next;
    });
  }

  function loadScenario(id: number | null) {
    setLoadedId(id);
    if (id === null) {
      setCounts(guestListCounts);
      setChoices(new Map());
      return;
    }
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) return;
    setCounts({ adults: scenario.adultCount, children: scenario.childCount });
    setChoices(
      new Map(
        scenario.choices.map((c) => [
          c.budgetItemId,
          { itemOptionId: c.itemOptionId, excluded: c.excluded },
        ]),
      ),
    );
  }

  function handleSave(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const overwrite = formData.get("target") === "overwrite";

    startSaving(async () => {
      const result = await saveScenario({
        id: overwrite ? loadedId : null,
        name,
        adultCount: counts.adults,
        childCount: counts.children,
        notes: notes === "" ? null : notes,
        choices: [...choices.entries()].map(([budgetItemId, choice]) => ({
          budgetItemId,
          itemOptionId: choice.itemOptionId,
          excluded: choice.excluded,
        })),
      });
      if (result.status === "error") {
        setSaveError(result.message);
        return;
      }
      setSaveError(null);
      setSaveOpen(false);
      if (result.scenarioId !== undefined) setLoadedId(result.scenarioId);
      router.refresh();
    });
  }

  const grouped = groupByCategory(budget.lines);
  const marginalAdult = marginalAdultCents(budget);
  const marginalChild = marginalChildCents(budget);
  const variableShare =
    budget.totalCents === 0
      ? 0
      : Math.round((budget.variableTotalCents / budget.totalCents) * 100);

  return (
    <>
      {/* Which scenario is on the workbench. */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          <span className="eyebrow text-ink-faint">Modelling</span>
          <select
            value={loadedId ?? ""}
            onChange={(e) =>
              loadScenario(e.target.value === "" ? null : Number(e.target.value))
            }
            className={`${inputClass} w-auto py-1.5 text-xs`}
          >
            <option value="">Your guest list, base costs</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {dirty && (
          <span className="inline-flex items-center gap-2 text-xs text-brass">
            Unsaved changes
            <button
              onClick={() => loadScenario(loadedId)}
              className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
            >
              <Undo2 size={12} aria-hidden />
              Revert
            </button>
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {loaded && (
            <DeleteButton
              action={async () => {
                await deleteScenario(loaded.id);
                loadScenario(null);
                router.refresh();
              }}
              label={`Delete scenario ${loaded.name}`}
            />
          )}
          <Button
            variant="subtle"
            size="sm"
            onClick={() => {
              setSaveError(null);
              setSaveOpen(true);
            }}
          >
            <Save size={14} aria-hidden />
            Save as scenario
          </Button>
        </div>
      </div>

      {/* The headline: total, and how much of it the guest count controls. */}
      <section className="rounded-lg border border-hairline bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow text-brass">Total at this guest count</p>
            <p className="figures mt-1 text-5xl leading-none tabular-nums">
              {formatCentsWhole(budget.totalCents)}
            </p>
          </div>
          <dl className="flex gap-8 text-right">
            <div>
              <dd className="figures text-lg">
                {formatCentsWhole(budget.perGuestCents)}
              </dd>
              <dt className="eyebrow mt-0.5 text-ink-faint">Per guest</dt>
            </div>
            <div>
              <dd className="figures text-lg">
                {formatCentsWhole(marginalAdult)}
              </dd>
              <dt className="eyebrow mt-0.5 text-ink-faint">One more adult</dt>
            </div>
            <div>
              <dd className="figures text-lg">
                {formatCentsWhole(marginalChild)}
              </dd>
              <dt className="eyebrow mt-0.5 text-ink-faint">One more child</dt>
            </div>
          </dl>
        </div>

        {/* Waterline: how much of the total the guest count actually moves. */}
        <div className="mt-6">
          <div className="flex h-2 overflow-hidden rounded-full bg-paper">
            <div
              className="bg-ink transition-[width] duration-200 ease-out"
              style={{ width: `${100 - variableShare}%` }}
            />
            <div
              className="bg-brass-bright transition-[width] duration-200 ease-out"
              style={{ width: `${variableShare}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink-soft">
            <span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink align-middle" />{" "}
              <span className="figures">
                {formatCentsWhole(budget.fixedTotalCents)}
              </span>{" "}
              fixed, whatever the numbers
            </span>
            <span>
              <span className="figures">
                {formatCentsWhole(budget.variableTotalCents)}
              </span>{" "}
              rides on the guest count{" "}
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brass-bright align-middle" />
            </span>
          </div>
        </div>

        {/* The single slider that recalculates everything. */}
        <div className="mt-6 grid gap-4 border-t border-hairline pt-5 sm:grid-cols-2">
          <CountSlider
            label="Adults"
            value={counts.adults}
            max={200}
            tone="sage"
            onChange={(adults) => setCounts((c) => ({ ...c, adults }))}
          />
          <CountSlider
            label="Children"
            value={counts.children}
            max={40}
            tone="rose"
            onChange={(children) => setCounts((c) => ({ ...c, children }))}
          />
        </div>
        <button
          onClick={() => setCounts(guestListCounts)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          <RotateCcw size={12} aria-hidden />
          Match the guest list ({guestListCounts.adults} adults,{" "}
          {guestListCounts.children} children)
        </button>
      </section>

      {/* The ledger itself. */}
      <div className="mt-8 overflow-x-auto rounded-lg border border-hairline bg-card shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                Item
              </th>
              <th className="eyebrow px-3 py-3 font-semibold text-ink-faint">
                {nameA} / {nameB}
              </th>
              <th className="eyebrow px-3 py-3 text-right font-semibold text-ink-faint">
                Fixed
              </th>
              <th className="eyebrow px-3 py-3 text-right font-semibold text-ink-faint">
                Per head
              </th>
              <th className="eyebrow px-3 py-3 font-semibold text-ink-faint">
                Tier
              </th>
              <th className="eyebrow px-4 py-3 text-right font-semibold text-ink-faint">
                Total
              </th>
              <th className="px-2 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          {grouped.map(({ category, lines, subtotalCents }) => (
            <tbody key={category}>
              <tr className="border-b border-hairline bg-paper/60">
                <th
                  colSpan={5}
                  className="eyebrow px-4 py-2 text-left font-semibold text-brass"
                >
                  {category}
                </th>
                <td className="figures px-4 py-2 text-right text-xs text-ink-soft">
                  {formatCentsWhole(subtotalCents)}
                </td>
                <td />
              </tr>
              {lines.map((line) => {
                const choice = choices.get(line.item.id) ?? NO_CHOICE;
                return (
                  <tr
                    key={line.item.id}
                    className={`group border-b border-hairline/60 transition-colors duration-150 hover:bg-brass-tint/25 ${
                      line.excluded ? "opacity-45" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className={`font-medium ${line.excluded ? "line-through" : ""}`}
                      >
                        {line.item.name}
                      </span>
                      {line.item.notes && (
                        <span className="block max-w-xs text-xs text-ink-faint italic">
                          {line.item.notes}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <PriorityBars
                        priorityA={line.item.priorityA}
                        priorityB={line.item.priorityB}
                        nameA={nameA}
                        nameB={nameB}
                      />
                    </td>
                    <td className="figures px-3 py-2.5 text-right text-xs text-ink-soft">
                      {line.fixedCents === 0
                        ? "—"
                        : formatCentsWhole(line.fixedCents)}
                    </td>
                    <td className="figures px-3 py-2.5 text-right text-xs text-ink-soft">
                      {line.perAdultCents === 0 && line.perChildCents === 0 ? (
                        "—"
                      ) : (
                        <>
                          {formatCentsWhole(line.perAdultCents)}
                          {line.perChildCents !== line.perAdultCents && (
                            <span className="text-ink-faint">
                              {" / "}
                              {formatCentsWhole(line.perChildCents)}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <TierSlider
                        item={line.item}
                        choice={choice}
                        disabled={line.excluded}
                        onChange={(itemOptionId) =>
                          setChoice(line.item.id, { itemOptionId })
                        }
                      />
                    </td>
                    <td className="figures px-4 py-2.5 text-right font-medium">
                      {formatCentsWhole(line.totalCents)}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          onClick={() =>
                            setChoice(line.item.id, { excluded: !line.excluded })
                          }
                          aria-pressed={line.excluded}
                          title={line.excluded ? "Put it back" : "Cut this item"}
                          aria-label={
                            line.excluded
                              ? `Put ${line.item.name} back`
                              : `Cut ${line.item.name}`
                          }
                          className={`rounded-md p-1.5 transition-colors duration-150 ${
                            line.excluded
                              ? "text-madder hover:bg-madder-tint"
                              : "text-ink-faint hover:bg-madder-tint hover:text-madder"
                          }`}
                        >
                          <Ban size={15} aria-hidden />
                        </button>
                        <BudgetItemDialog item={line.item} />
                        <DeleteButton
                          action={deleteBudgetItem.bind(null, line.item.id)}
                          label={`Delete ${line.item.name}`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
          <tfoot>
            <tr className="border-t border-hairline-strong">
              <td colSpan={5} className="px-4 py-3 text-right text-sm font-medium">
                Total
              </td>
              <td className="figures px-4 py-3 text-right text-base font-medium">
                {formatCentsWhole(budget.totalCents)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <BudgetItemDialog
          trigger={
            <Button variant="subtle" size="sm">
              <Plus size={14} aria-hidden />
              Add budget item
            </Button>
          }
        />
      </div>

      <Dialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save scenario"
      >
        <form action={handleSave} className="space-y-4">
          <Field
            label="Name"
            hint={`${counts.adults} adults, ${counts.children} children · ${formatCentsWhole(budget.totalCents)}`}
          >
            <input
              name="name"
              defaultValue={loaded?.name ?? ""}
              placeholder="e.g. Keep it under 60k"
              className={inputClass}
              required
              autoFocus
            />
          </Field>
          <Field label="Notes">
            <textarea
              name="notes"
              defaultValue={loaded?.notes ?? ""}
              rows={2}
              className={inputClass}
            />
          </Field>
          {loaded && (
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink-soft">
                Save to
              </legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="target" value="overwrite" defaultChecked />
                Update &ldquo;{loaded.name}&rdquo;
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="target" value="new" />
                Save as a new scenario
              </label>
            </fieldset>
          )}
          {saveError && (
            <p role="alert" className="text-sm text-madder">
              {saveError}
            </p>
          )}
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save scenario"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function CountSlider({
  label,
  value,
  max,
  tone,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  tone: "sage" | "rose";
  onChange: (value: number) => void;
}) {
  const id = `count-${label.toLowerCase()}`;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="text-xs font-semibold tracking-wide text-ink-soft"
        >
          {label}
        </label>
        <span className="figures text-xl">{value}</span>
      </div>
      <Slider
        id={id}
        value={value}
        max={max}
        tone={tone}
        valueText={`${value} ${label.toLowerCase()}`}
        onChange={onChange}
      />
    </div>
  );
}

function groupByCategory(lines: ReturnType<typeof computeBudget>["lines"]) {
  const groups = new Map<string, typeof lines>();
  for (const line of lines) {
    const existing = groups.get(line.item.category);
    if (existing) existing.push(line);
    else groups.set(line.item.category, [line]);
  }
  return [...groups.entries()].map(([category, groupLines]) => ({
    category,
    lines: groupLines,
    subtotalCents: groupLines.reduce((sum, l) => sum + l.totalCents, 0),
  }));
}

/** True when the modeller still matches the scenario it was loaded from. */
function matchesScenario(scenario: ScenarioRecord, state: ModelState): boolean {
  if (
    scenario.adultCount !== state.counts.adults ||
    scenario.childCount !== state.counts.children
  ) {
    return false;
  }
  if (scenario.choices.length !== state.choices.size) return false;
  return scenario.choices.every((c) => {
    const current = state.choices.get(c.budgetItemId);
    return (
      current !== undefined &&
      current.itemOptionId === c.itemOptionId &&
      current.excluded === c.excluded
    );
  });
}
