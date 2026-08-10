"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Button, Field, IconButton, inputClass } from "@/components/ui";
import { createGuest, updateGuest } from "./actions";

export type GuestFormValues = {
  id: number;
  firstName: string;
  lastName: string;
  householdId: number;
  side: "a" | "b" | "both";
  ageBracket: "adult" | "child" | "infant";
  dietaryNotes: string | null;
  rsvpStatus: "pending" | "attending" | "declined";
  tableId: number | null;
};

type Option = { id: number; name: string };

export function GuestDialog({
  households,
  tables,
  nameA,
  nameB,
  guest,
}: {
  households: Option[];
  tables: Option[];
  nameA: string;
  nameB: string;
  guest?: GuestFormValues;
}) {
  const [open, setOpen] = useState(false);
  const editing = guest !== undefined;

  return (
    <>
      {editing ? (
        <IconButton
          label={`Edit ${guest.firstName} ${guest.lastName}`}
          onClick={() => setOpen(true)}
        >
          <Pencil size={15} aria-hidden />
        </IconButton>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus size={15} aria-hidden />
          Add guest
        </Button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${guest.firstName}` : "Add guest"}
      >
        <ActionForm
          action={editing ? updateGuest : createGuest}
          onSuccess={() => setOpen(false)}
          submitLabel={editing ? "Save changes" : "Add guest"}
        >
          {editing && <input type="hidden" name="id" value={guest.id} />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First name">
              <input
                name="firstName"
                defaultValue={guest?.firstName}
                className={inputClass}
                required
                autoFocus
              />
            </Field>
            <Field label="Last name">
              <input
                name="lastName"
                defaultValue={guest?.lastName}
                className={inputClass}
                required
              />
            </Field>
          </div>
          <Field label="Household">
            <Select
              name="householdId"
              defaultValue={guest ? String(guest.householdId) : ""}
              placeholder="Choose a household…"
              required
              options={households.map((h) => ({
                value: String(h.id),
                label: h.name,
              }))}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Side">
              <Select
                name="side"
                defaultValue={guest?.side ?? "both"}
                options={[
                  { value: "a", label: `${nameA}’s` },
                  { value: "b", label: `${nameB}’s` },
                  { value: "both", label: "Both" },
                ]}
              />
            </Field>
            <Field label="Age">
              <Select
                name="ageBracket"
                defaultValue={guest?.ageBracket ?? "adult"}
                options={[
                  { value: "adult", label: "Adult" },
                  { value: "child", label: "Child" },
                  { value: "infant", label: "Infant" },
                ]}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="RSVP">
              <Select
                name="rsvpStatus"
                defaultValue={guest?.rsvpStatus ?? "pending"}
                options={[
                  { value: "pending", label: "Pending" },
                  { value: "attending", label: "Attending" },
                  { value: "declined", label: "Declined" },
                ]}
              />
            </Field>
            <Field label="Table">
              <Select
                name="tableId"
                defaultValue={guest?.tableId ? String(guest.tableId) : ""}
                options={[
                  { value: "", label: "Unseated" },
                  ...tables.map((t) => ({ value: String(t.id), label: t.name })),
                ]}
              />
            </Field>
          </div>
          <Field label="Dietary notes">
            <input
              name="dietaryNotes"
              defaultValue={guest?.dietaryNotes ?? ""}
              placeholder="e.g. Vegetarian, nut allergy"
              className={inputClass}
            />
          </Field>
        </ActionForm>
      </Dialog>
    </>
  );
}
