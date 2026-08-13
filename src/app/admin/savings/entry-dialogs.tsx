"use client";

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DatePicker } from "@/components/date-picker";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Field, IconButton, inputClass } from "@/components/ui";
import { centsToInput } from "@/lib/money";
import {
  createContribution,
  createPayment,
  updateContribution,
  updatePayment,
} from "./actions";

function EditTrigger({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <IconButton label={label} onClick={onClick}>
      <Pencil size={15} aria-hidden />
    </IconButton>
  );
}

export type ContributionValues = {
  id: number;
  date: string;
  amountCents: number;
  source: string;
  notes: string | null;
};

export function ContributionDialog({
  contribution,
  today,
  trigger,
}: {
  contribution?: ContributionValues;
  today: string;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = contribution !== undefined;

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <EditTrigger
          label={`Edit contribution from ${contribution?.source}`}
          onClick={() => setOpen(true)}
        />
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit contribution" : "Record a contribution"}
      >
        <ActionForm
          action={editing ? updateContribution : createContribution}
          onSuccess={() => setOpen(false)}
          submitLabel={editing ? "Save changes" : "Add contribution"}
        >
          {editing && <input type="hidden" name="id" value={contribution.id} />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Amount">
              <input
                name="amount"
                inputMode="decimal"
                defaultValue={
                  contribution ? centsToInput(contribution.amountCents) : ""
                }
                placeholder="2500"
                className={inputClass}
                required
                autoFocus
              />
            </Field>
            <Field label="Date">
              <DatePicker
                name="date"
                defaultValue={contribution?.date ?? today}
                clearable={false}
              />
            </Field>
          </div>
          <Field label="Source" hint="Where the money came from">
            <input
              name="source"
              defaultValue={contribution?.source}
              placeholder="e.g. Monthly savings"
              className={inputClass}
              required
            />
          </Field>
          <Field label="Notes">
            <input
              name="notes"
              defaultValue={contribution?.notes ?? ""}
              className={inputClass}
            />
          </Field>
        </ActionForm>
      </Dialog>
    </>
  );
}

export type PaymentValues = {
  id: number;
  budgetItemId: number;
  amountCents: number;
  dueDate: string;
  paidDate: string | null;
  notes: string | null;
};

export function PaymentDialog({
  payment,
  budgetItems,
  today,
  trigger,
}: {
  payment?: PaymentValues;
  budgetItems: Array<{ id: number; name: string; category: string }>;
  today: string;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = payment !== undefined;

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <EditTrigger label="Edit payment" onClick={() => setOpen(true)} />
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit payment" : "Schedule a payment"}
      >
        <ActionForm
          action={editing ? updatePayment : createPayment}
          onSuccess={() => setOpen(false)}
          submitLabel={editing ? "Save changes" : "Add payment"}
        >
          {editing && <input type="hidden" name="id" value={payment.id} />}
          <Field label="What it pays for">
            <Select
              name="budgetItemId"
              defaultValue={payment ? String(payment.budgetItemId) : ""}
              placeholder="Choose a budget item…"
              required
              options={budgetItems.map((item) => ({
                value: String(item.id),
                label: item.name,
                hint: item.category,
              }))}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Amount">
              <input
                name="amount"
                inputMode="decimal"
                defaultValue={payment ? centsToInput(payment.amountCents) : ""}
                placeholder="1500"
                className={inputClass}
                required
              />
            </Field>
            <Field label="Due">
              <DatePicker
                name="dueDate"
                defaultValue={payment?.dueDate ?? today}
                clearable={false}
              />
            </Field>
          </div>
          <Field label="Paid on" hint="Leave blank while it is still owing">
            <DatePicker
              name="paidDate"
              defaultValue={payment?.paidDate ?? ""}
              placeholder="Still owing"
            />
          </Field>
          <Field label="Notes">
            <input
              name="notes"
              defaultValue={payment?.notes ?? ""}
              placeholder="e.g. Deposit"
              className={inputClass}
            />
          </Field>
        </ActionForm>
      </Dialog>
    </>
  );
}
