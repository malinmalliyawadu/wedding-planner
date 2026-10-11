/**
 * What a bad link shows, guests' and planner's alike.
 *
 * Next's own page sets white text when the phone is in dark mode and
 * leaves the background to the page underneath - which here is the ivory
 * paper, so a guest with dark mode on saw a blank sheet. This sets both,
 * in the app's own ink, and says nothing a stranger should not hear: no
 * link into the planner, only the front door.
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center text-ink">
      <p className="eyebrow text-brass">Not found</p>
      <h1 className="mt-3 font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-tight text-balance">
        This page could not be found
      </h1>
      <p className="mt-3 max-w-sm text-ink-soft">
        If you followed a link, check that it was copied in full.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-11 items-center px-3 text-sm text-ink-soft underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink"
      >
        Go to the front page
      </Link>
    </main>
  );
}
