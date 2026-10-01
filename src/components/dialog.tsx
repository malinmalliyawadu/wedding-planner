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
/**
 * `md` is a form. `lg` is for a record laid out in columns, which needs
 * the width to be worth laying out in columns at all - below `sm:` both
 * are the same nearly-full-width sheet either way.
 */
const DIALOG_WIDTHS = {
  md: "max-w-md",
  lg: "max-w-3xl",
} as const;

export function Dialog({
  open,
  onClose,
  title,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: keyof typeof DIALOG_WIDTHS;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);

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
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) closes - but
        // only a press that also began there. A click is dispatched on the
        // nearest common ancestor of where the button went down and where
        // it came up, so a selection dragged out of a text field, or a
        // press on a popover panel that closed before the release, both
        // arrive here looking like a click on the backdrop.
        if (e.target === ref.current && pressedBackdrop.current) onClose();
        pressedBackdrop.current = false;
      }}
      className={`m-auto w-[calc(100%-1.5rem)] animate-rise rounded-lg bg-card p-0 text-ink shadow-overlay backdrop:bg-spine/55 backdrop:backdrop-blur-[2px] ${DIALOG_WIDTHS[size]}`}
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
