"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { DeleteButton } from "@/components/delete-button";
import { Dialog } from "@/components/dialog";
import { Button, EmptyState, Field, IconButton, inputClass } from "@/components/ui";
import { deleteFaq, saveFaq } from "../actions";

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
  // A new question goes on the end. Plain arithmetic on the props - it
  // is derived from what is on screen, so there is nothing to store.
  const nextOrder = items.length === 0 ? 0 : items.at(-1)!.sortOrder + 1;

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
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex items-start justify-between gap-3 border-t border-hairline py-4 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{item.question}</p>
                <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">
                  {item.answer}
                </p>
              </div>
              <div className="row-actions flex shrink-0 gap-1">
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
          <input
            type="hidden"
            name="sortOrder"
            value={editing?.sortOrder ?? nextOrder}
          />
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
