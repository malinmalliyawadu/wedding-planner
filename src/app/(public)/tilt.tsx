"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Something that leans towards the pointer, the way a card held in the
 * hand turns a little as you look it over.
 *
 * It only writes two custom properties, `--tilt-x` and `--tilt-y`; the
 * class the caller passes decides what those do. That is what lets the
 * same component lean the front door's calling card, which owns its own
 * `perspective()`, and the envelope, which lives inside the stage's 3D
 * context and must not add one of its own.
 *
 * Pointer only. A finger has no position until it lands, and it lands on
 * the thing it means to tap - so on a phone this renders the wrapper and
 * never attaches a listener. Reduced motion is honoured the same way.
 * `global` follows the pointer over the whole window rather than over
 * the element, for the envelope, which is wider than the screen and
 * covers it anyway.
 */
export function Tilt({
  max = 5,
  global = false,
  enabled = true,
  className = "",
  children,
}: {
  /** Degrees of lean at the edge. Small: a card, not a game. */
  max?: number;
  global?: boolean;
  /** Off, and the lean settles back to flat and stays there. */
  enabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (x: number, y: number) => {
      // Moving the pointer up should lean the top away, so the X
      // rotation runs against the vertical position.
      el.style.setProperty("--tilt-x", `${(-y * max).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(x * max).toFixed(2)}deg`);
    };
    if (!enabled) {
      set(0, 0);
      return;
    }
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduced.matches) return;

    let frame = 0;
    // Measured once as the pointer arrives rather than on every move:
    // the box is itself rotating, and its projected rectangle wobbles
    // with it, which would feed the lean back into its own input.
    let box: DOMRect | null = null;
    const clamp = (n: number) => Math.max(-1, Math.min(1, n));

    const onMove = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const b = global
          ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
          : (box ??= el.getBoundingClientRect());
        set(
          clamp(((event.clientX - b.left) / b.width) * 2 - 1),
          clamp(((event.clientY - b.top) / b.height) * 2 - 1),
        );
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      box = null;
      set(0, 0);
    };

    const target = global ? document.documentElement : el;
    target.addEventListener("pointermove", onMove as EventListener);
    target.addEventListener("pointerleave", onLeave);
    return () => {
      target.removeEventListener("pointermove", onMove as EventListener);
      target.removeEventListener("pointerleave", onLeave);
      onLeave();
    };
  }, [max, global, enabled]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
