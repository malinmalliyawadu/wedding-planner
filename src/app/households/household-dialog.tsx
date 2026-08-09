"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Dialog } from "@/components/dialog";
import { Button, Field, inputClass } from "@/components/ui";
import { createHousehold, updateHousehold } from "./actions";

export type HouseholdFormValues = {
  id: number;
  name: string;
  address: string | null;
  inviteStage: "not_invited" | "save_the_date" | "invited" | "confirmed";
  notes: string | null;
};

export function HouseholdDialog({
  household,
}: {
  household?: HouseholdFormValues;
}) {
  const [open, setOpen] = useState(false);
  const editing = household !== undefined;

  return (
    <>
      {editing ? (
        <button
          onClick={() => setOpen(true)}
          aria-label={`Edit ${household.name}`}
          title="Edit"
          className="rounded-md p-1.5 text-ink-faint transition-colors duration-150 hover:bg-brass-tint/60 hover:text-ink"
        >
          <Pencil size={15} aria-hidden />
        </button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus size={15} aria-hidden />
          Add household
        </Button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${household.name}` : "Add household"}
      >
        <ActionForm
          action={editing ? updateHousehold : createHousehold}
          onSuccess={() => setOpen(false)}
          submitLabel={editing ? "Save changes" : "Add household"}
        >
          {editing && <input type="hidden" name="id" value={household.id} />}
          <Field label="Name" hint="How it will read on the envelope">
            <input
              name="name"
              defaultValue={household?.name}
              className={inputClass}
              required
              autoFocus
            />
          </Field>
          <Field label="Address">
            <input
              name="address"
              defaultValue={household?.address ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Invite stage">
            <select
              name="inviteStage"
              defaultValue={household?.inviteStage ?? "not_invited"}
              className={inputClass}
            >
              <option value="not_invited">Not invited</option>
              <option value="save_the_date">Save the date</option>
              <option value="invited">Invited</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              name="notes"
              defaultValue={household?.notes ?? ""}
              rows={2}
              className={inputClass}
            />
          </Field>
        </ActionForm>
      </Dialog>
    </>
  );
}
