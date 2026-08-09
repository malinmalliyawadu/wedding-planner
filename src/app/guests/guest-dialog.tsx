"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Dialog } from "@/components/dialog";
import { Button, Field, inputClass } from "@/components/ui";
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
        <button
          onClick={() => setOpen(true)}
          aria-label={`Edit ${guest.firstName} ${guest.lastName}`}
          title="Edit"
          className="rounded-md p-1.5 text-ink-faint transition-colors duration-150 hover:bg-brass-tint/60 hover:text-ink"
        >
          <Pencil size={15} aria-hidden />
        </button>
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
          <div className="grid grid-cols-2 gap-3">
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
            <select
              name="householdId"
              defaultValue={guest?.householdId ?? ""}
              className={inputClass}
              required
            >
              <option value="" disabled>
                Choose a household…
              </option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Side">
              <select
                name="side"
                defaultValue={guest?.side ?? "both"}
                className={inputClass}
              >
                <option value="a">{nameA}&rsquo;s</option>
                <option value="b">{nameB}&rsquo;s</option>
                <option value="both">Both</option>
              </select>
            </Field>
            <Field label="Age">
              <select
                name="ageBracket"
                defaultValue={guest?.ageBracket ?? "adult"}
                className={inputClass}
              >
                <option value="adult">Adult</option>
                <option value="child">Child</option>
                <option value="infant">Infant</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="RSVP">
              <select
                name="rsvpStatus"
                defaultValue={guest?.rsvpStatus ?? "pending"}
                className={inputClass}
              >
                <option value="pending">Pending</option>
                <option value="attending">Attending</option>
                <option value="declined">Declined</option>
              </select>
            </Field>
            <Field label="Table">
              <select
                name="tableId"
                defaultValue={guest?.tableId ?? ""}
                className={inputClass}
              >
                <option value="">Unseated</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
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
