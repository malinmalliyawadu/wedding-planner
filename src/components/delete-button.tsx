"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

/**
 * Two-step inline delete: first click reveals a confirm, second click
 * runs the (already-bound) server action. No browser confirm() popups.
 */
export function DeleteButton({
  action,
  label,
}: {
  action: () => Promise<void>;
  label: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <button
          disabled={pending}
          onClick={() => startTransition(async () => action())}
          className="rounded-sm font-semibold text-madder hover:underline disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
        <span className="text-hairline-strong" aria-hidden>
          /
        </span>
        <button
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="rounded-sm text-ink-soft hover:underline"
        >
          Keep
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      aria-label={label}
      title={label}
      className="rounded-md p-1.5 text-ink-faint transition-colors duration-150 hover:bg-madder-tint hover:text-madder"
    >
      <Trash2 size={15} aria-hidden />
    </button>
  );
}
