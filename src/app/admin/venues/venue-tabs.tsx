"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The two halves of choosing a venue, and they are deliberately separate
 * pages: what each place costs and whether everyone fits is arithmetic,
 * and which one you would rather get married at is not. Putting them in
 * one table would let the second quietly read as a column of the first.
 */
const TABS = [
  { href: "/admin/venues", label: "Compare" },
  { href: "/admin/venues/rank", label: "Rank" },
] as const;

export function VenueTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Venue views" className="mt-4 flex gap-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
              active
                ? "bg-ink text-paper"
                : "text-ink-soft hover:bg-brass-tint/60 hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
