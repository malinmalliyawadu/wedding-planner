"use client";

import { useEffect } from "react";

/**
 * The fallback that makes the flourishes arrive in browsers with no
 * scroll-driven animations.
 *
 * `animation-timeline: view()` is the nicer mechanism - the compositor
 * drives it, there is no listener, and the drawing tracks the scrollbar
 * rather than merely being triggered by it - but it is not everywhere
 * yet, and this page is opened by a hundred guests on whatever browser
 * came with their phone. Where it is missing, the CSS holds each
 * flourish at its opening state and waits for `data-shown`, which is all
 * this puts there.
 *
 * It costs nothing on browsers that do support it: the effect returns on
 * the first line and no observer is ever constructed.
 *
 * Mounted once per page rather than per flourish, so this is one
 * observer for the whole document and the ornaments stay server
 * components with no client bundle of their own.
 */
export function Reveal() {
  useEffect(() => {
    if (CSS.supports("animation-timeline", "view()")) return;
    // Reduced motion has its own rules, and they say "already arrived".
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const el of document.querySelectorAll("[data-reveal]")) {
        (el as HTMLElement).dataset.shown = "";
      }
      return;
    }

    const targets = document.querySelectorAll("[data-reveal]");
    if (!targets.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.shown = "";
          // Once it has arrived it has arrived; nothing here plays twice.
          observer.unobserve(entry.target);
        }
      },
      // A little inside the viewport, so it is not still animating on the
      // very edge of the screen where nobody can see it happen.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );
    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return null;
}
