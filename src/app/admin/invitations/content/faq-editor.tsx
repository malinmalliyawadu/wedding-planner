"use client";

import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { ActionForm } from "@/components/action-form";
import { DeleteButton } from "@/components/delete-button";
import { Dialog } from "@/components/dialog";
import { Button, EmptyState, Field, IconButton, inputClass } from "@/components/ui";
import { type Direction, moveOne } from "@/lib/reorder";
import { deleteFaq, moveFaq, saveFaq } from "../actions";

export type FaqRow = {
  id: number;
  question: string;
  answer: string;
  sortOrder: number;
  published: boolean;
};

/**
 * The questions guests ask, answered once.
 *
 * Every entry here is a text message the couple do not have to answer at
 * eleven at night, which is the whole reason the section exists.
 */
export function FaqEditor({ items }: { items: FaqRow[] }) {
  const [editing, setEditing] = useState<FaqRow | null>(null);
  const [open, setOpen] = useState(false);
  // The move shows at once and the server catches up; if it refuses, the
  // list falls back to what was saved when the transition ends.
  const [shown, move] = useOptimistic(
    items,
    (current, { id, direction }: { id: number; direction: Direction }) =>
      moveOne(current, id, direction),
  );
  const [, startTransition] = useTransition();

  function reorder(id: number, direction: Direction) {
    startTransition(async () => {
      move({ id, direction });
      await moveFaq(id, direction);
    });
  }

  function start(item: FaqRow | null) {
    setEditing(item);
    setOpen(true);
  }

  return (
    <section className="mt-10 border-t border-hairline pt-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ink">Questions and answers</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Dress code, children, parking, what happens if it rains.
          </p>
        </div>
        <Button size="sm" variant="subtle" onClick={() => start(null)}>
          <Plus size={14} aria-hidden />
          Add
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No questions yet"
            hint="Add the ones people always ask, and the texts stop."
            action={<Button onClick={() => start(null)}>Add a question</Button>}
          />
        </div>
      ) : (
        <ul className="mt-4 rounded-lg border border-hairline bg-card px-5 shadow-card">
          {shown.map((item, index) => (
            <li
              key={item.id}
              // On a phone four buttons beside the answer would squeeze it
              // into half the row, so they drop underneath it instead.
              className="group flex flex-col gap-2 border-t border-hairline py-4 first:border-t-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{item.question}</p>
                <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">
                  {item.answer}
                </p>
              </div>
              <div className="row-actions -mr-2 flex shrink-0 gap-1 self-end sm:mr-0 sm:self-auto">
                {/* aria-disabled rather than disabled: a disabled button
                    drops focus, so pressing "up" until it reached the top
                    would leave a keyboard user nowhere. */}
                <IconButton
                  label={`Move "${item.question}" up`}
                  aria-disabled={index === 0}
                  onClick={() => index > 0 && reorder(item.id, "up")}
                  className="aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-faint"
                >
                  <ArrowUp size={15} aria-hidden />
                </IconButton>
                <IconButton
                  label={`Move "${item.question}" down`}
                  aria-disabled={index === shown.length - 1}
                  onClick={() => index < shown.length - 1 && reorder(item.id, "down")}
                  className="aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-faint"
                >
                  <ArrowDown size={15} aria-hidden />
                </IconButton>
                <IconButton label="Edit" onClick={() => start(item)}>
                  <Pencil size={15} aria-hidden />
                </IconButton>
                <DeleteButton
                  label={`Delete "${item.question}"`}
                  action={async () => {
                    await deleteFaq(item.id);
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit the question" : "Add a question"}
      >
        <ActionForm
          action={saveFaq}
          onSuccess={() => setOpen(false)}
          submitLabel="Save"
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Question">
            <input
              name="question"
              defaultValue={editing?.question ?? ""}
              className={inputClass}
              required
              maxLength={300}
            />
          </Field>
          <Field label="Answer">
            <textarea
              name="answer"
              defaultValue={editing?.answer ?? ""}
              className={inputClass}
              rows={4}
              required
              maxLength={2000}
            />
          </Field>
        </ActionForm>
      </Dialog>
    </section>
  );
}
