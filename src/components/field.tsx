"use client";

import { createContext, useContext, useId, type ReactNode } from "react";

/**
 * The id of the caption the surrounding Field is rendering.
 *
 * A native input is named by the <label> wrapped around it. A control built
 * out of a button is not: name computation would fold in the button's own
 * text and announce "Side Ru's" instead of "Side". Select and DatePicker
 * read this and point `aria-labelledby` straight at the caption.
 *
 * This lives apart from ui.tsx because a module holding `createContext`
 * cannot be imported by a Server Component, and the pages import Chip and
 * PageHeader from there.
 */
const FieldLabelContext = createContext<string | undefined>(undefined);

export function useFieldLabelId(): string | undefined {
  return useContext(FieldLabelContext);
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const labelId = useId();
  return (
    <label className="block">
      <span
        id={labelId}
        className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-soft"
      >
        {label}
      </span>
      <FieldLabelContext value={labelId}>{children}</FieldLabelContext>
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}
