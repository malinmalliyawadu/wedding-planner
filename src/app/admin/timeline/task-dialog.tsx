"use client";

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DatePicker } from "@/components/date-picker";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Field, IconButton, inputClass } from "@/components/ui";
import { createTask, updateTask } from "./actions";

export type TaskValues = {
  id: number;
  title: string;
  dueDate: string | null;
  owner: "a" | "b" | "both";
  category: string | null;
  notes: string | null;
  needsConfirmation: boolean;
};

export function TaskDialog({
  task,
  nameA,
  nameB,
  trigger,
}: {
  task?: TaskValues;
  nameA: string;
  nameB: string;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = task !== undefined;

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <IconButton
          label={`Edit ${task?.title ?? "task"}`}
          onClick={() => setOpen(true)}
        >
          <Pencil size={15} aria-hidden />
        </IconButton>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit task" : "Add a task"}
      >
        <ActionForm
          action={editing ? updateTask : createTask}
          onSuccess={() => setOpen(false)}
          submitLabel={editing ? "Save changes" : "Add task"}
        >
          {editing && <input type="hidden" name="id" value={task.id} />}
          <Field label="Task">
            <input
              name="title"
              defaultValue={task?.title}
              placeholder="e.g. Confirm the flowers"
              className={inputClass}
              required
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Due">
              <DatePicker
                name="dueDate"
                defaultValue={task?.dueDate ?? ""}
                placeholder="No date"
              />
            </Field>
            <Field label="Whose job">
              <Select
                name="owner"
                defaultValue={task?.owner ?? "both"}
                options={[
                  { value: "a", label: nameA },
                  { value: "b", label: nameB },
                  { value: "both", label: "Both" },
                ]}
              />
            </Field>
          </div>
          <Field label="Category">
            <input
              name="category"
              defaultValue={task?.category ?? ""}
              placeholder="e.g. Ceremony"
              className={inputClass}
            />
          </Field>
          <Field label="Notes">
            <textarea
              name="notes"
              defaultValue={task?.notes ?? ""}
              rows={3}
              className={inputClass}
            />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="needsConfirmation"
              defaultChecked={task?.needsConfirmation ?? false}
              className="mt-0.5"
            />
            <span>
              The date is a placeholder
              <span className="block text-xs text-ink-faint">
                Untick once you have checked the real deadline.
              </span>
            </span>
          </label>
        </ActionForm>
      </Dialog>
    </>
  );
}
