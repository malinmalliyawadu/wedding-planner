"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/budget", label: "Modeller" },
  { href: "/admin/budget/scenarios", label: "Compare" },
  { href: "/admin/budget/compromise", label: "Compromise" },
] as const;

export function BudgetTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Budget views" className="mt-4 flex gap-1">
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
