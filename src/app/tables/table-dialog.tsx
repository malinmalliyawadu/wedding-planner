"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Dialog } from "@/components/dialog";
import { Button, Field, inputClass } from "@/components/ui";
import { createTable, updateTable } from "./actions";

export function TableDialog({
  table,
}: {
  table?: { id: number; name: string; capacity: number };
}) {
  const [open, setOpen] = useState(false);
  const editing = table !== undefined;

  return (
    <>
      {editing ? (
        <button
          onClick={() => setOpen(true)}
          aria-label={`Edit ${table.name}`}
          title="Edit"
          className="rounded-md p-1.5 text-ink-faint transition-colors duration-150 hover:bg-brass-tint/60 hover:text-ink"
        >
          <Pencil size={15} aria-hidden />
        </button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus size={15} aria-hidden />
          Add table
        </Button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${table.name}` : "Add table"}
      >
        <ActionForm
          action={editing ? updateTable : createTable}
          onSuccess={() => setOpen(false)}
          submitLabel={editing ? "Save changes" : "Add table"}
        >
          {editing && <input type="hidden" name="id" value={table.id} />}
          <Field label="Name">
            <input
              name="name"
              defaultValue={table?.name}
              className={inputClass}
              required
              autoFocus
            />
          </Field>
          <Field label="Capacity">
            <input
              name="capacity"
              type="number"
              min={1}
              max={100}
              defaultValue={table?.capacity ?? 8}
              className={inputClass}
              required
            />
          </Field>
        </ActionForm>
      </Dialog>
    </>
  );
}
