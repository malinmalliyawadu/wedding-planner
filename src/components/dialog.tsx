"use client";

import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { IconButton } from "./ui";

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
      className="m-auto w-[calc(100%-1.5rem)] max-w-md animate-rise rounded-lg bg-card p-0 text-ink shadow-overlay backdrop:bg-spine/55 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4 sm:px-6">
        <h2 className="font-display text-lg">{title}</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </dialog>
  );
}
