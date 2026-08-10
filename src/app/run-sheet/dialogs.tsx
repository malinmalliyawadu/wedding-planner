"use client";

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Dialog } from "@/components/dialog";
import { Field, IconButton, inputClass } from "@/components/ui";
import type { Recipient, RunSheetItem } from "@/lib/run-sheet";
import {
  createRecipient,
  createRunSheetItem,
  updateRecipient,
  updateRunSheetItem,
} from "./actions";

function EditTrigger({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <IconButton label={label} onClick={onClick}>
      <Pencil size={15} aria-hidden />
    </IconButton>
  );
}

/** Postgres hands back "14:00:00"; the input wants "14:00". */
function toTimeInput(time: string | null): string {
  return time === null ? "" : time.slice(0, 5);
}

export function RunSheetItemDialog({
  item,
  recipients,
  trigger,
}: {
  item?: RunSheetItem;
  recipients: Recipient[];
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = item !== undefined;

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <EditTrigger
          label={`Edit ${item?.title ?? "moment"}`}
          onClick={() => setOpen(true)}
        />
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit this moment" : "Add to the run sheet"}
      >
        <ActionForm
          action={editing ? updateRunSheetItem : createRunSheetItem}
          onSuccess={() => setOpen(false)}
          submitLabel={editing ? "Save changes" : "Add to the day"}
        >
          {editing && <input type="hidden" name="id" value={item.id} />}
          <Field label="What happens">
            <input
              name="title"
              defaultValue={item?.title}
              placeholder="e.g. Ceremony"
              className={inputClass}
              required
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Starts">
              <input
                type="time"
                name="startTime"
                defaultValue={toTimeInput(item?.startTime ?? null)}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Ends" hint="Blank for a moment, not a stretch">
              <input
                type="time"
                name="endTime"
                defaultValue={toTimeInput(item?.endTime ?? null)}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Where">
              <input
                name="location"
                defaultValue={item?.location ?? ""}
                placeholder="e.g. Marquee"
                className={inputClass}
              />
            </Field>
            <Field label="Who is running it">
              <input
                name="lead"
                defaultValue={item?.lead ?? ""}
                placeholder="e.g. The MC"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Detail" hint="What the sheet should actually say">
            <textarea
              name="detail"
              defaultValue={item?.detail ?? ""}
              rows={3}
              className={inputClass}
            />
          </Field>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink-soft">
              Whose sheet it appears on
            </legend>
            {recipients.length === 0 ? (
              <p className="text-xs text-ink-faint">
                Add a recipient first and this moment can be sent to them.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {recipients.map((recipient) => (
                  <label
                    key={recipient.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="recipientIds"
                      value={recipient.id}
                      defaultChecked={item?.recipientIds.includes(recipient.id)}
                    />
                    {recipient.role}
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-ink-faint">
              Tick nobody and it stays on the master sheet only.
            </p>
          </fieldset>
        </ActionForm>
      </Dialog>
    </>
  );
}

export function RecipientDialog({
  recipient,
  nextSortOrder,
  trigger,
}: {
  recipient?: Recipient;
  nextSortOrder: number;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = recipient !== undefined;

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <EditTrigger
          label={`Edit ${recipient?.role ?? "recipient"}`}
          onClick={() => setOpen(true)}
        />
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${recipient.role}` : "Add a recipient"}
      >
        <ActionForm
          action={editing ? updateRecipient : createRecipient}
          onSuccess={() => setOpen(false)}
          submitLabel={editing ? "Save changes" : "Add recipient"}
        >
          {editing && <input type="hidden" name="id" value={recipient.id} />}
          <input
            type="hidden"
            name="sortOrder"
            value={recipient?.sortOrder ?? nextSortOrder}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Role" hint="Heads their sheet">
              <input
                name="role"
                defaultValue={recipient?.role}
                placeholder="e.g. Photographer"
                className={inputClass}
                required
                autoFocus
              />
            </Field>
            <Field label="Name">
              <input
                name="name"
                defaultValue={recipient?.name}
                placeholder="e.g. Ana Whitfield"
                className={inputClass}
                required
              />
            </Field>
          </div>
          <Field
            label="Note for them"
            hint="Printed at the top of their sheet"
          >
            <textarea
              name="notes"
              defaultValue={recipient?.notes ?? ""}
              rows={3}
              className={inputClass}
            />
          </Field>
        </ActionForm>
      </Dialog>
    </>
  );
}
