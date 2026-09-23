"use client";

import { useEffect, useRef } from "react";

/**
 * The number of days, counting up to itself.
 *
 * Server-rendered as the final figure, so a browser with no script and a
 * search-free preview both see the true number; the count is a flourish
 * laid over it on mount, and it writes straight into the text node
 * rather than through state so nothing re-renders on the way.
 *
 * `delay` is the same delay the figure rises in on, or the count would
 * be half spent before the line is visible. On the invitation the count
 * also waits for the envelope: the figure is held under the curtain
 * with everything else above the fold, and a count that ran behind it
 * would arrive already finished.
 */
export function Countdown({
  days,
  delay = 0,
  className = "",
}: {
  days: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    // One or two days needs no run-up, and reduced motion gets the
    // figure as it is.
    if (!el || days < 3) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const duration = 1200 + Math.min(days, 500);
    const run = () => {
      timer = setTimeout(() => {
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = String(Math.round(eased * days));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        el.textContent = "0";
        frame = requestAnimationFrame(tick);
      }, delay);
    };

    const main = document.getElementById("main");
    let observer: MutationObserver | undefined;
    if (main?.dataset.envelope === "pending") {
      observer = new MutationObserver(() => {
        if (main.dataset.envelope === "pending") return;
        observer?.disconnect();
        run();
      });
      observer.observe(main, { attributes: true, attributeFilter: ["data-envelope"] });
    } else {
      run();
    }

    return () => {
      observer?.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      el.textContent = String(days);
    };
  }, [days, delay]);

  return (
    <span ref={ref} className={className}>
      {days}
    </span>
  );
}
