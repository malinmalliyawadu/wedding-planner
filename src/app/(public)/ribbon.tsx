"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The ribbon: a strip of paper that follows the guest down the card.
 *
 * The invitation is one long page on purpose - a card, not a site - but
 * a guest comes back to it at eleven at night to check one thing, and
 * making them scroll for it is the wrong kind of ceremony. So once the
 * card's face has scrolled away this appears, with the monogram, the
 * sections, and the reply, and it says where you are as you go.
 *
 * Nothing here is a route. Every link is an anchor into the same page,
 * which is what keeps the invitation shareable as one URL and lets the
 * browser's own back button behave.
 */
export type RibbonLink = { id: string; label: string };

export function Ribbon({
  monogram,
  links,
  cta,
  /**
   * The element that has to leave the viewport before the ribbon shows.
   * Omitted, the ribbon is simply always there - which is right for the
   * album, where there is no card face to wait for.
   */
  showAfter,
}: {
  monogram: { a: string; b: string };
  links: RibbonLink[];
  cta?: { href: string; label: string };
  showAfter?: string;
}) {
  const [shown, setShown] = useState(!showAfter);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (!showAfter) return;
    const face = document.getElementById(showAfter);
    if (!face) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShown(!entry.isIntersecting),
      // A little before the face is fully gone, so the ribbon arrives
      // as it leaves rather than a beat after.
      { rootMargin: "-64px 0px 0px 0px" },
    );
    observer.observe(face);
    return () => observer.disconnect();
  }, [showAfter]);

  useEffect(() => {
    /*
     * In-page links glide rather than jump - but only when clicked.
     * `scroll-behavior: smooth` on the document would also apply to a
     * link opened with `#rsvp` already on it, and a guest arriving from
     * a shared link would watch the page scroll past everything for a
     * second before it settled. So the gliding is done here, on the
     * click, and the initial hash still lands instantly.
     */
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href^="#"]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const id = decodeURIComponent(anchor.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      event.preventDefault();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      history.pushState(null, "", `#${id}`);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    // Which section is under the reader. Whichever section's top edge is
    // the last one above the middle of the viewport wins: a heading you
    // have scrolled past is the section you are in.
    const targets = links
      .map((link) => document.getElementById(link.id))
      .filter((el): el is HTMLElement => el !== null);
    if (!targets.length) return;

    let ticking = false;
    const measure = () => {
      ticking = false;
      const line = window.innerHeight * 0.4;
      let active: string | null = null;
      for (const el of targets) {
        if (el.getBoundingClientRect().top <= line) active = el.id;
      }
      setCurrent(active);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [links]);

  return (
    <nav
      aria-label="On this page"
      className="ribbon"
      data-shown={shown ? "" : undefined}
      // Keyboard users should not tab through a ribbon they cannot see.
      inert={!shown}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:gap-8 sm:px-6">
        <a
          href="#main"
          className="engraved flex min-h-11 shrink-0 items-center text-[0.8rem] text-ink"
          aria-label="Back to the top"
        >
          {monogram.a}
          <span className="ampersand mx-0.5 text-[1.2em]">&amp;</span>
          {monogram.b}
        </a>

        <div className="ribbon-row -mx-1 flex min-w-0 flex-1 items-center gap-5 overflow-x-auto px-1 sm:justify-center sm:gap-7">
          {links.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              className="ribbon-link"
              aria-current={current === link.id ? "true" : undefined}
            >
              {link.label}
            </a>
          ))}
        </div>

        {cta && (
          <Link
            href={cta.href}
            className="hidden min-h-9 shrink-0 items-center rounded-full border border-brass/50 px-4 text-[0.6875rem] font-semibold tracking-caps text-brass uppercase transition-colors hover:border-brass hover:bg-brass-tint sm:inline-flex"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </nav>
  );
}
