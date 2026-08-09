"use client";

import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

/**
 * Modal built on the native <dialog> element: focus trapping, Escape to
 * close and inert background come free from the platform.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) closes.
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-full max-w-md animate-rise rounded-lg bg-card p-0 text-ink shadow-overlay backdrop:bg-spine/55 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <h2 className="font-display text-lg">{title}</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-ink-faint transition-colors hover:bg-brass-tint/60 hover:text-ink"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  );
}
