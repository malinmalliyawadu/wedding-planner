"use client";

import { useState, type ReactNode } from "react";
import { Pencil, Plus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DeleteButton } from "@/components/delete-button";
import { Dialog } from "@/components/dialog";
import { Field, inputClass } from "@/components/ui";
import type { BudgetItem, BudgetOption } from "@/lib/budget";
import { formatCentsWhole } from "@/lib/money";
import {
  createBudgetItem,
  createItemOption,
  deleteItemOption,
  updateBudgetItem,
  updateItemOption,
} from "./actions";

/** Cents to a plain dollar string for editing: 16500 -> "165". */
function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function BudgetItemDialog({
  item,
  trigger,
}: {
  item?: BudgetItem;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = item !== undefined;

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label={`Edit ${item?.name ?? "item"}`}
          title="Edit"
          className="rounded-md p-1.5 text-ink-faint transition-colors duration-150 hover:bg-brass-tint/60 hover:text-ink"
        >
          <Pencil size={15} aria-hidden />
        </button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${item.name}` : "Add budget item"}
      >
        <ActionForm
          action={editing ? updateBudgetItem : createBudgetItem}
          onSuccess={() => setOpen(false)}
          submitLabel={editing ? "Save changes" : "Add item"}
        >
          {editing && <input type="hidden" name="id" value={item.id} />}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input
                name="name"
                defaultValue={item?.name}
                className={inputClass}
                required
                autoFocus
              />
            </Field>
            <Field label="Category">
              <input
                name="category"
                defaultValue={item?.category}
                placeholder="e.g. Food & drink"
                className={inputClass}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Fixed cost" hint="Whatever the numbers">
              <input
                name="fixedCost"
                inputMode="decimal"
                defaultValue={centsToInput(item?.fixedCostCents ?? 0)}
                className={inputClass}
              />
            </Field>
            <Field label="Per adult">
              <input
                name="perHeadCost"
                inputMode="decimal"
                defaultValue={centsToInput(item?.perHeadCostCents ?? 0)}
                className={inputClass}
              />
            </Field>
            <Field label="Per child" hint="Blank = adult rate">
              <input
                name="perChildCost"
                inputMode="decimal"
                defaultValue={centsToInput(item?.perChildCostCents ?? null)}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority A" hint="1 = could lose it, 5 = essential">
              <input
                name="priorityA"
                type="number"
                min={1}
                max={5}
                defaultValue={item?.priorityA ?? 3}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Priority B" hint="1 = could lose it, 5 = essential">
              <input
                name="priorityB"
                type="number"
                min={1}
                max={5}
                defaultValue={item?.priorityB ?? 3}
                className={inputClass}
                required
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              name="notes"
              defaultValue={item?.notes ?? ""}
              rows={2}
              className={inputClass}
            />
          </Field>
        </ActionForm>

        {editing && <TierEditor item={item} />}
      </Dialog>
    </>
  );
}

/** Tiers for an item, managed inside the item dialog. */
function TierEditor({ item }: { item: BudgetItem }) {
  const [adding, setAdding] = useState(false);
  const sorted = [...item.options].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section className="mt-6 border-t border-hairline pt-5">
      <div className="flex items-center justify-between">
        <h3 className="eyebrow text-brass">Tiers</h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-ink-soft hover:text-ink"
        >
          <Plus size={12} aria-hidden />
          Add tier
        </button>
      </div>

      {sorted.length === 0 && !adding && (
        <p className="mt-2 text-xs text-ink-faint">
          No tiers. Add two or more to get a slider on this row.
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {sorted.map((option) => (
          <TierRow key={option.id} item={item} option={option} />
        ))}
      </ul>

      {adding && (
        <div className="mt-3 rounded-md border border-hairline bg-paper/60 p-3">
          <TierForm
            item={item}
            sortOrder={sorted.length}
            onDone={() => setAdding(false)}
          />
        </div>
      )}
    </section>
  );
}

function TierRow({ item, option }: { item: BudgetItem; option: BudgetOption }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="rounded-md border border-hairline bg-paper/60 p-3">
        <TierForm
          item={item}
          option={option}
          sortOrder={option.sortOrder}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-brass-tint/40">
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      <span className="figures text-xs text-ink-soft">
        {formatCentsWhole(option.fixedCostCents)}
        {option.perHeadCostCents > 0 && (
          <span className="text-ink-faint">
            {" + "}
            {formatCentsWhole(option.perHeadCostCents)}/head
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          onClick={() => setEditing(true)}
          aria-label={`Edit tier ${option.label}`}
          className="rounded-md p-1 text-ink-faint hover:bg-brass-tint hover:text-ink"
        >
          <Pencil size={13} aria-hidden />
        </button>
        <DeleteButton
          action={deleteItemOption.bind(null, option.id)}
          label={`Delete tier ${option.label}`}
        />
      </span>
    </li>
  );
}

function TierForm({
  item,
  option,
  sortOrder,
  onDone,
}: {
  item: BudgetItem;
  option?: BudgetOption;
  sortOrder: number;
  onDone: () => void;
}) {
  return (
    <ActionForm
      action={option ? updateItemOption : createItemOption}
      onSuccess={onDone}
      submitLabel={option ? "Save tier" : "Add tier"}
    >
      {option && <input type="hidden" name="id" value={option.id} />}
      <input type="hidden" name="budgetItemId" value={item.id} />
      <input type="hidden" name="sortOrder" value={sortOrder} />
      <Field label="Label">
        <input
          name="label"
          defaultValue={option?.label}
          placeholder="e.g. Full day + second shooter"
          className={inputClass}
          required
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Fixed">
          <input
            name="fixedCost"
            inputMode="decimal"
            defaultValue={centsToInput(option?.fixedCostCents ?? 0)}
            className={inputClass}
          />
        </Field>
        <Field label="Per adult">
          <input
            name="perHeadCost"
            inputMode="decimal"
            defaultValue={centsToInput(option?.perHeadCostCents ?? 0)}
            className={inputClass}
          />
        </Field>
        <Field label="Per child">
          <input
            name="perChildCost"
            inputMode="decimal"
            defaultValue={centsToInput(option?.perChildCostCents ?? null)}
            className={inputClass}
          />
        </Field>
      </div>
    </ActionForm>
  );
}
