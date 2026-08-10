"use client";

import {
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type RefObject,
} from "react";

/** Gap between the trigger and the panel, and the panel and the viewport. */
const GAP = 6;
const EDGE = 8;
/** Assumed height before the panel has been laid out, and the floor for it. */
const ASSUMED_HEIGHT = 320;
const MIN_HEIGHT = 168;

/**
 * A panel anchored to a trigger and drawn in the top layer.
 *
 * The native popover API does the hard parts. The panel escapes the scroll
 * clipping of a `<dialog>` - the UA stylesheet gives dialogs `overflow:
 * auto`, which cuts an absolutely positioned menu in half - Escape and
 * click-outside dismissal are the platform's, and a trigger wired up with
 * `popovertarget` closes the panel when clicked while it is open rather
 * than closing and immediately reopening it. All this adds is placement.
 */
export function Popover({
  id,
  anchorRef,
  open,
  onOpenChange,
  matchAnchorWidth = true,
  minWidth = 208,
  className = "",
  children,
  ...rest
}: {
  /** Must match the trigger's `popoverTarget` and `aria-controls`. */
  id: string;
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Widen the panel to at least the trigger, as a select should. */
  matchAnchorWidth?: boolean;
  minWidth?: number;
} & Omit<ComponentPropsWithoutRef<"div">, "id">) {
  const ref = useRef<HTMLDivElement>(null);

  // The callback is read through a ref so that a caller passing an inline
  // function does not re-register the listeners on every render.
  const notify = useRef(onOpenChange);
  useEffect(() => {
    notify.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    const panel = ref.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;

    const reposition = () => place(anchor, panel, matchAnchorWidth, minWidth);

    // beforetoggle runs before the panel is displayed, so it can only guess
    // the height; toggle runs once it is laid out and corrects the guess
    // inside the same frame the open animation starts in.
    const onBeforeToggle = (event: Event) => {
      if (isOpening(event)) reposition();
    };
    const onToggle = (event: Event) => {
      const opening = isOpening(event);
      if (opening) reposition();
      notify.current(opening);
    };

    panel.addEventListener("beforetoggle", onBeforeToggle);
    panel.addEventListener("toggle", onToggle);
    return () => {
      panel.removeEventListener("beforetoggle", onBeforeToggle);
      panel.removeEventListener("toggle", onToggle);
    };
  }, [anchorRef, matchAnchorWidth, minWidth]);

  // Follow React's idea of open, for the paths the browser does not drive
  // itself (opening with the keyboard, closing after a choice is made).
  useEffect(() => {
    const panel = ref.current;
    if (!panel?.isConnected) return;
    const shown = panel.matches(":popover-open");
    if (open && !shown) panel.showPopover();
    if (!open && shown) panel.hidePopover();
  }, [open]);

  useEffect(() => {
    const panel = ref.current;
    const anchor = anchorRef.current;
    if (!open || !panel || !anchor) return;
    const reposition = () => place(anchor, panel, matchAnchorWidth, minWidth);
    // Scrolling a long list of options inside the panel does not move the
    // trigger, so there is nothing to follow.
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panel.contains(event.target)) return;
      reposition();
    };
    // Capture, so scrolling of any ancestor moves the panel with the trigger.
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", reposition);
    };
  }, [open, anchorRef, matchAnchorWidth, minWidth]);

  return (
    <div
      ref={ref}
      id={id}
      popover="auto"
      // The panel sits in the top layer but is still a DOM descendant of the
      // <label> that Field renders, and clicking a label forwards a click to
      // its control. Keeping clicks inside the panel stops a choice from
      // reopening the trigger it was made from.
      onClick={(event) => event.stopPropagation()}
      // React's onBlur is focusout, so it catches focus leaving any child:
      // tabbing out of the panel closes it.
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!next) return;
        if (ref.current?.contains(next) || anchorRef.current?.contains(next)) return;
        ref.current?.hidePopover();
      }}
      className={`popover-panel rounded-md border border-hairline-strong bg-card shadow-overlay ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

function isOpening(event: Event): boolean {
  return "newState" in event && (event as ToggleEvent).newState === "open";
}

/**
 * Put the panel under the trigger, or above it when there is more room
 * there, clamped inside the viewport with a scrollable body if it still
 * does not fit. On a phone that clamping is what keeps a long list of
 * households usable rather than running off the bottom of the screen.
 */
function place(
  anchor: HTMLElement,
  panel: HTMLElement,
  matchAnchorWidth: boolean,
  minWidth: number,
) {
  const rect = anchor.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  const width = Math.min(
    Math.max(minWidth, matchAnchorWidth ? rect.width : 0),
    vw - EDGE * 2,
  );
  const below = vh - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;

  // offsetHeight is 0 until the panel is shown; until then, assume a height.
  const measured = panel.offsetHeight;
  const wanted = measured || ASSUMED_HEIGHT;
  const up = wanted > below && above > below;
  const room = Math.max(MIN_HEIGHT, up ? above : below);
  const height = Math.min(measured || room, room);

  panel.style.width = `${width}px`;
  panel.style.maxHeight = `${room}px`;
  panel.style.left = `${clamp(rect.left, EDGE, Math.max(EDGE, vw - width - EDGE))}px`;
  panel.style.top = up
    ? `${Math.max(EDGE, rect.top - GAP - height)}px`
    : `${rect.bottom + GAP}px`;
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(Math.max(n, low), high);
}
