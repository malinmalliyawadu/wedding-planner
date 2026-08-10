"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";
import { formatDateShort, formatMonthYear, todayNZ } from "@/lib/dates";
import {
  addDays,
  addMonths,
  monthGrid,
  monthKey,
  parseISO,
  weekdayIndex,
} from "@/lib/iso-date";
import { Popover } from "./popover";
import { useFieldLabelId } from "./field";
import { IconButton } from "./ui";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * A calendar for the plain "YYYY-MM-DD" dates this app stores.
 *
 * Every step is string arithmetic from `iso-date.ts`, never a `Date` in the
 * browser's local zone, so picking the 1st cannot hand back the 31st of the
 * month before. `<input type="date">` was doing the same job, but its
 * calendar is the browser's rather than ours, it renders a different
 * control on every platform, and on a phone it is a full-screen spinner.
 */
export function DatePicker({
  name,
  value,
  defaultValue = "",
  onChange,
  placeholder = "Choose a date",
  clearable = true,
  disabled = false,
  label,
  id,
}: {
  /** Posts the chosen date with the surrounding form. */
  name?: string;
  /** Pass with onChange for a controlled picker; otherwise defaultValue. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /**
   * Optional dates keep a way back to empty; a required one is simply not
   * clearable, so there is no state the form can be submitted in that the
   * server would reject.
   */
  clearable?: boolean;
  disabled?: boolean;
  /** Only needed when the picker is not inside a <Field>. */
  label?: string;
  id?: string;
}) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const current = controlled ? value : internal;

  const today = todayNZ();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(current || today);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const panelId = useId();
  const headingId = `${panelId}-heading`;
  const dayId = (iso: string) => `${panelId}-day-${iso}`;
  const fieldLabelId = useFieldLabelId();

  // Arrow keys move the focused day, and the day carries the focus with it.
  useEffect(() => {
    if (!open) return;
    document.getElementById(dayId(focused))?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focused]);

  function commit(next: string) {
    if (!controlled) setInternal(next);
    onChange?.(next);
  }

  function choose(iso: string) {
    commit(iso);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const { key } = event;

    if (key in moves) {
      event.preventDefault();
      setFocused(addDays(focused, moves[key]));
      return;
    }
    if (key === "Home" || key === "End") {
      event.preventDefault();
      const weekday = weekdayIndex(focused);
      setFocused(addDays(focused, key === "Home" ? -weekday : 6 - weekday));
      return;
    }
    if (key === "PageUp" || key === "PageDown") {
      event.preventDefault();
      const by = key === "PageUp" ? -1 : 1;
      setFocused(addMonths(focused, event.shiftKey ? by * 12 : by));
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      choose(focused);
    }
  }

  const grid = monthGrid(focused);
  const shownMonth = monthKey(focused);

  return (
    <>
      <div className="relative flex">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          aria-labelledby={fieldLabelId}
          aria-label={label}
          disabled={disabled}
          popoverTarget={panelId}
          className={`flex w-full items-center gap-2 rounded-md border bg-white py-2 pl-3 text-left text-sm text-ink transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11 pointer-coarse:text-base ${
            clearable && current ? "pr-10" : "pr-3"
          } ${open ? "border-brass" : "border-hairline-strong hover:border-ink-faint"}`}
        >
          <CalendarDays
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className="shrink-0 text-ink-faint"
          />
          <span className={`truncate ${current ? "" : "text-ink-faint"}`}>
            {current ? formatDateShort(current) : placeholder}
          </span>
        </button>

        {clearable && current && (
          <IconButton
            label="Clear the date"
            // The wrapping <label> would otherwise forward this click on to
            // the trigger and open the calendar we just cleared.
            onClick={(event) => {
              event.stopPropagation();
              commit("");
              triggerRef.current?.focus();
            }}
            className="absolute top-1/2 right-1 -translate-y-1/2"
          >
            <X size={14} aria-hidden />
          </IconButton>
        )}
      </div>

      {name !== undefined && <input type="hidden" name={name} value={current} />}

      <Popover
        id={panelId}
        anchorRef={triggerRef}
        open={open}
        onOpenChange={(next) => {
          if (next) setFocused(current || today);
          setOpen(next);
        }}
        matchAnchorWidth={false}
        minWidth={296}
        role="dialog"
        aria-label={`${label ?? "Date"} calendar`}
        className="p-3"
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex">
            <IconButton
              label="Previous year"
              onClick={() => setFocused(addMonths(focused, -12))}
            >
              <ChevronsLeft size={15} aria-hidden />
            </IconButton>
            <IconButton
              label="Previous month"
              onClick={() => setFocused(addMonths(focused, -1))}
            >
              <ChevronLeft size={15} aria-hidden />
            </IconButton>
          </div>
          <h2
            id={headingId}
            aria-live="polite"
            className="font-display text-sm whitespace-nowrap"
          >
            {formatMonthYear(focused)}
          </h2>
          <div className="flex">
            <IconButton
              label="Next month"
              onClick={() => setFocused(addMonths(focused, 1))}
            >
              <ChevronRight size={15} aria-hidden />
            </IconButton>
            <IconButton
              label="Next year"
              onClick={() => setFocused(addMonths(focused, 12))}
            >
              <ChevronsRight size={15} aria-hidden />
            </IconButton>
          </div>
        </div>

        <div
          role="grid"
          aria-labelledby={headingId}
          onKeyDown={onGridKeyDown}
          className="mt-2 border-t border-hairline pt-2"
        >
          <div role="row" className="grid grid-cols-7">
            {WEEKDAYS.map((day) => (
              <span
                key={day}
                role="columnheader"
                aria-label={day}
                className="eyebrow py-1 text-center text-[9px] text-ink-faint"
              >
                {day}
              </span>
            ))}
          </div>

          {[0, 7, 14, 21, 28, 35].map((start) => (
            <div key={start} role="row" className="grid grid-cols-7">
              {grid.slice(start, start + 7).map((iso) => {
                const outside = monthKey(iso) !== shownMonth;
                const isSelected = iso === current;
                const isToday = iso === today;
                return (
                  <button
                    key={iso}
                    id={dayId(iso)}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    tabIndex={iso === focused ? 0 : -1}
                    onClick={() => choose(iso)}
                    className={`figures flex h-9 items-center justify-center rounded-md text-[13px] transition-colors duration-150 pointer-coarse:h-11 ${
                      isSelected
                        ? "bg-ink font-medium text-paper"
                        : isToday
                          ? "font-semibold text-brass ring-1 ring-brass-bright ring-inset hover:bg-brass-tint"
                          : outside
                            ? "text-ink-faint/70 hover:bg-brass-tint/60"
                            : "hover:bg-brass-tint/60"
                    }`}
                  >
                    {parseISO(iso).day}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-hairline pt-2">
          <button
            type="button"
            onClick={() => choose(today)}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-ink-soft transition-colors duration-150 hover:bg-brass-tint/60 hover:text-ink"
          >
            Today
          </button>
          {clearable && current && (
            <button
              type="button"
              onClick={() => {
                commit("");
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-ink-soft transition-colors duration-150 hover:bg-brass-tint/60 hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      </Popover>
    </>
  );
}
