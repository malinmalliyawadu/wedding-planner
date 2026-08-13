import type { ReactNode } from "react";

/**
 * The invitation's furniture.
 *
 * The planner packs information in; this packs it out. Sections are wide
 * apart, headings are small and quiet above the thing they name, and the
 * only ornament in the whole page is the lozenge below - one motif,
 * repeated, doing the work that a dozen decorations would fight over.
 */

/** Hairline rule broken by a brass lozenge. The engraver's full stop. */
export function Ornament({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center gap-3 ${className}`}
      aria-hidden
    >
      <span className="h-px w-14 bg-hairline-strong sm:w-20" />
      <span className="h-1.5 w-1.5 rotate-45 bg-brass-bright" />
      <span className="h-px w-14 bg-hairline-strong sm:w-20" />
    </div>
  );
}

export function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      // scroll-mt keeps a heading clear of the sticky RSVP bar when the
      // section is jumped to from a link rather than scrolled to.
      className="mx-auto w-full max-w-2xl scroll-mt-24 px-6 py-14 sm:py-20"
    >
      <header className="text-center">
        <p className="eyebrow text-brass">{eyebrow}</p>
        <h2 className="mt-3 font-display text-[clamp(1.6rem,6vw,2.25rem)] leading-tight text-ink">
          {title}
        </h2>
        <Ornament className="mt-5" />
      </header>
      <div className="mt-8 sm:mt-10">{children}</div>
    </section>
  );
}

/** A quiet card for a block of the couple's own words. */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-hairline bg-card p-6 shadow-card sm:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * A labelled paragraph of the couple's prose. Newlines are honoured
 * because the couple type these into a textarea and expect the shape of
 * what they wrote to survive.
 */
export function Prose({ children }: { children: string }) {
  return (
    <p className="text-[0.95rem] leading-relaxed whitespace-pre-line text-ink-soft">
      {children}
    </p>
  );
}
