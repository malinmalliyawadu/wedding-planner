"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover } from "./popover";
import { useFieldLabelId } from "./field";

export type SelectOption = {
  value: string;
  label: string;
  /** Secondary text, shown in the menu but not on the closed control. */
  hint?: string;
  disabled?: boolean;
};

/**
 * A dropdown built to the select-only combobox pattern: focus stays on the
 * trigger and the highlighted row is announced through
 * `aria-activedescendant`, so arrow keys, Home/End and type-ahead all behave
 * the way a native select does.
 *
 * The reason not to keep the native one is that a `<select>` cannot be
 * styled past its border - no check marks, no hints, no menu that matches
 * the rest of the stationery - and on Android it renders a full-screen
 * dialog that looks nothing like the app.
 */
export function Select({
  options,
  name,
  value,
  defaultValue = "",
  onChange,
  placeholder = "Choose…",
  required = false,
  disabled = false,
  size = "md",
  width = "full",
  label,
  id,
  className = "",
}: {
  options: SelectOption[];
  /** Posts the chosen value with the surrounding form. */
  name?: string;
  /** Pass with onChange for a controlled select; otherwise defaultValue. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  size?: "md" | "sm";
  /** "auto" shrinks the trigger to its content, for a filter bar. */
  width?: "full" | "auto";
  /** Only needed when the select is not inside a <Field>. */
  label?: string;
  id?: string;
  className?: string;
}) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const current = controlled ? value : internal;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typed = useRef({ buffer: "", at: 0 });

  const panelId = useId();
  const optionId = (index: number) => `${panelId}-option-${index}`;
  const fieldLabelId = useFieldLabelId();

  const selected = options.find((option) => option.value === current);

  /** The next option that can actually be chosen, wrapping at both ends. */
  function step(from: number, by: number): number {
    const { length } = options;
    if (length === 0) return -1;
    for (let n = 1; n <= length; n++) {
      const index = (((from + by * n) % length) + length) % length;
      if (!options[index].disabled) return index;
    }
    return -1;
  }

  /**
   * Opening lands on the current choice, so the first arrow key moves from
   * where you are rather than from the top of the list.
   */
  function setOpenState(next: boolean) {
    if (next) {
      const index = options.findIndex((option) => option.value === current);
      setActive(index >= 0 && !options[index].disabled ? index : step(-1, 1));
    }
    setOpen(next);
  }

  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    if (!controlled) setInternal(option.value);
    onChange?.(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const { key } = event;

    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        setOpenState(true);
        return;
      }
    } else {
      if (key === "ArrowDown") {
        event.preventDefault();
        setActive(step(active, 1));
        return;
      }
      if (key === "ArrowUp") {
        event.preventDefault();
        setActive(step(active, -1));
        return;
      }
      if (key === "Home") {
        event.preventDefault();
        setActive(step(-1, 1));
        return;
      }
      if (key === "End") {
        event.preventDefault();
        setActive(step(options.length, -1));
        return;
      }
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        choose(active);
        return;
      }
    }

    // Type-ahead: keystrokes within a second of each other build a prefix,
    // so "wh" finds the Whitfields rather than stopping at every W.
    if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = event.timeStamp;
      typed.current.buffer =
        now - typed.current.at > 1000 ? key : typed.current.buffer + key;
      typed.current.at = now;
      const prefix = typed.current.buffer.toLowerCase();
      const match = options.findIndex(
        (option) => !option.disabled && option.label.toLowerCase().startsWith(prefix),
      );
      if (match >= 0) {
        event.preventDefault();
        if (open) setActive(match);
        else choose(match);
      }
    }
  }

  const sizing =
    size === "sm"
      ? "px-2.5 py-1.5 text-xs pointer-coarse:min-h-11 pointer-coarse:text-sm"
      : "px-3 py-2 text-sm pointer-coarse:min-h-11 pointer-coarse:text-base";

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-labelledby={fieldLabelId}
        aria-label={label}
        aria-required={required || undefined}
        disabled={disabled}
        popoverTarget={panelId}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        className={`flex items-center justify-between gap-2 rounded-md border bg-white text-left text-ink transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${
          width === "full" ? "w-full" : "max-w-full"
        } ${
          open ? "border-brass" : "border-hairline-strong hover:border-ink-faint"
        } ${sizing} ${className}`}
      >
        <span className={`truncate ${selected ? "" : "text-ink-faint"}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronsUpDown
          size={14}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 text-ink-faint"
        />
      </button>

      {name !== undefined && <input type="hidden" name={name} value={current} />}

      <Popover
        id={panelId}
        anchorRef={triggerRef}
        open={open}
        onOpenChange={setOpenState}
        role="listbox"
        aria-labelledby={fieldLabelId}
        aria-label={label}
        // Keep focus on the trigger: a blurred trigger closes the menu, and
        // it would close before the click on a row ever landed.
        onMouseDown={(event) => event.preventDefault()}
        className="py-1"
      >
        {options.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-ink-faint">Nothing to choose from</p>
        ) : (
          <ul>
            {options.map((option, index) => {
              const isSelected = option.value === current;
              return (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  onClick={() => choose(index)}
                  onMouseMove={() => !option.disabled && setActive(index)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm pointer-coarse:py-2.5 ${
                    option.disabled ? "cursor-not-allowed text-ink-faint" : ""
                  } ${index === active ? "bg-brass-tint" : ""}`}
                >
                  <Check
                    size={13}
                    strokeWidth={2.25}
                    aria-hidden
                    className={`shrink-0 text-brass ${isSelected ? "" : "invisible"}`}
                  />
                  <span className={`truncate ${isSelected ? "font-medium" : ""}`}>
                    {option.label}
                  </span>
                  {option.hint && (
                    <span className="ml-auto shrink-0 pl-2 text-xs text-ink-faint">
                      {option.hint}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Popover>
    </>
  );
}
