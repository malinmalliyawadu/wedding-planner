"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Button, Field, IconButton, inputClass } from "@/components/ui";
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
        <IconButton label={`Edit ${household.name}`} onClick={() => setOpen(true)}>
          <Pencil size={15} aria-hidden />
        </IconButton>
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
            <Select
              name="inviteStage"
              defaultValue={household?.inviteStage ?? "not_invited"}
              options={[
                { value: "not_invited", label: "Not invited" },
                { value: "save_the_date", label: "Save the date" },
                { value: "invited", label: "Invited" },
                { value: "confirmed", label: "Confirmed" },
              ]}
            />
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
