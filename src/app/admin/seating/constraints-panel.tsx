"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DeleteButton } from "@/components/delete-button";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Button, Chip, Field, inputClass } from "@/components/ui";
import { createSeatingConstraint, deleteSeatingConstraint } from "./actions";

export type ConstraintRow = {
  id: number;
  guestAId: number;
  guestBId: number;
  guestAName: string;
  guestBName: string;
  kind: "together" | "apart";
  weight: number;
};

export function ConstraintsPanel({
  constraints,
  guests,
}: {
  constraints: ConstraintRow[];
  guests: Array<{ id: number; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const guestOptions = guests.map((g) => ({ value: String(g.id), label: g.name }));

  return (
    <section className="mt-8 rounded-lg border border-hairline bg-card shadow-card">
      <header className="flex flex-col items-start gap-3 border-b border-hairline px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="eyebrow text-brass">Who sits with whom</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Strength runs 1 (would be nice) to 10 (absolutely not). The solver
            breaks the weakest rules first.
          </p>
        </div>
        <Button variant="subtle" size="sm" onClick={() => setOpen(true)}>
          <Plus size={14} aria-hidden />
          Add a rule
        </Button>
      </header>

      {constraints.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-faint">
          No rules yet. Without them the solver only balances tables and keeps
          households together.
        </p>
      ) : (
        <ul className="divide-y divide-hairline/60">
          {constraints.map((c) => (
            <li key={c.id} className="group flex items-center gap-3 px-5 py-2.5">
              <span className="figures w-6 shrink-0 text-xs text-ink-faint">
                {c.weight}
              </span>
              <Chip tone={c.kind === "together" ? "sage" : "madder"}>
                {c.kind === "together" ? "Together" : "Apart"}
              </Chip>
              <span className="min-w-0 flex-1 truncate text-sm">
                {c.guestAName}{" "}
                <span className="text-ink-faint">
                  {c.kind === "together" ? "with" : "away from"}
                </span>{" "}
                {c.guestBName}
              </span>
              <span className="shrink-0 row-actions">
                <DeleteButton
                  action={deleteSeatingConstraint.bind(null, c.id)}
                  label={`Delete rule between ${c.guestAName} and ${c.guestBName}`}
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Add a seating rule">
        <ActionForm
          action={createSeatingConstraint}
          onSuccess={() => setOpen(false)}
          submitLabel="Add rule"
        >
          <Field label="Guest">
            <Select
              name="guestAId"
              placeholder="Choose a guest…"
              required
              options={guestOptions}
            />
          </Field>
          <Field label="Should sit">
            <Select
              name="kind"
              defaultValue="together"
              options={[
                { value: "together", label: "Together with" },
                { value: "apart", label: "Away from" },
              ]}
            />
          </Field>
          <Field label="Guest">
            <Select
              name="guestBId"
              placeholder="Choose a guest…"
              required
              options={guestOptions}
            />
          </Field>
          <Field
            label="Strength"
            hint="1 would be nice · 10 absolutely not"
          >
            <input
              type="number"
              name="weight"
              min={1}
              max={10}
              defaultValue={5}
              className={inputClass}
              required
            />
          </Field>
        </ActionForm>
      </Dialog>
    </section>
  );
}
