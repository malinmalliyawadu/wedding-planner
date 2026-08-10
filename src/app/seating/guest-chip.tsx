"use client";

import { useState } from "react";
import { Pin } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Button, Field, SideChip } from "@/components/ui";

export type BoardGuest = {
  id: number;
  firstName: string;
  lastName: string;
  householdId: number;
  householdName: string;
  side: "a" | "b" | "both";
  ageBracket: "adult" | "child" | "infant";
  dietaryNotes: string | null;
};

/**
 * A guest on the board. Draggable for the quick path, and clickable for
 * the same job without a mouse - drag is never the only way to move
 * someone.
 */
export function GuestChip({
  guest,
  tableId,
  pinned,
  tables,
  nameA,
  nameB,
  flagged,
  onMove,
  onTogglePin,
}: {
  guest: BoardGuest;
  tableId: number | null;
  pinned: boolean;
  tables: Array<{ id: number; name: string }>;
  nameA: string;
  nameB: string;
  /** True when this guest is caught up in a broken rule. */
  flagged: boolean;
  onMove: (tableId: number | null, pin: boolean) => void;
  onTogglePin: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <span
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", String(guest.id));
          e.dataTransfer.effectAllowed = "move";
        }}
        className={`group inline-flex max-w-full cursor-grab items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 active:cursor-grabbing ${
          flagged
            ? "border-madder/40 bg-madder-tint"
            : "border-hairline-strong bg-paper hover:border-ink-faint hover:bg-white"
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            guest.side === "a"
              ? "bg-sage-mid"
              : guest.side === "b"
                ? "bg-rose-mid"
                : "bg-brass-bright"
          }`}
        />
        <button
          onClick={() => setOpen(true)}
          className="truncate"
          title={`${guest.firstName} ${guest.lastName} · ${guest.householdName}`}
        >
          {guest.firstName} {guest.lastName.charAt(0)}.
        </button>
        {pinned && (
          <Pin
            size={10}
            aria-label="Pinned"
            className="shrink-0 text-brass"
            fill="currentColor"
          />
        )}
      </span>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${guest.firstName} ${guest.lastName}`}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <SideChip side={guest.side} nameA={nameA} nameB={nameB} />
            <span>{guest.householdName}</span>
            {guest.ageBracket !== "adult" && (
              <span className="capitalize">{guest.ageBracket}</span>
            )}
          </div>
          {guest.dietaryNotes && (
            <p className="text-xs text-ink-soft italic">{guest.dietaryNotes}</p>
          )}

          <Field label="Table">
            <Select
              value={tableId === null ? "" : String(tableId)}
              onChange={(value) =>
                onMove(value === "" ? null : Number(value), value !== "")
              }
              options={[
                { value: "", label: "Not seated" },
                ...tables.map((t) => ({ value: String(t.id), label: t.name })),
              ]}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pinned} onChange={onTogglePin} />
            Pin here, so the solver leaves them alone
          </label>

          <div className="flex justify-end pt-1">
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
