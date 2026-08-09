"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Armchair,
  LayoutDashboard,
  Mail,
  PiggyBank,
  Scale,
  Users,
} from "lucide-react";

const ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/guests", label: "Guests", icon: Users, countKey: "guests" },
  { href: "/households", label: "Households", icon: Mail, countKey: "households" },
  { href: "/tables", label: "Tables", icon: Armchair, countKey: "tables" },
  { href: "/budget", label: "Budget", icon: Scale },
  { href: "/savings", label: "Savings", icon: PiggyBank },
] as const;

export function NavList({
  counts,
}: {
  counts: { guests: number; households: number; tables: number };
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-3 py-5" aria-label="Main">
      <ul className="space-y-0.5">
        {ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
                  active
                    ? "bg-spine-raised text-spine-ink"
                    : "text-spine-ink-soft hover:bg-spine-raised/60 hover:text-spine-ink"
                }`}
              >
                <span
                  className={`h-4 w-px shrink-0 rounded-full transition-colors duration-150 ${
                    active ? "bg-brass-bright" : "bg-transparent"
                  }`}
                />
                <Icon size={15} strokeWidth={1.75} aria-hidden />
                <span className="tracking-wide">{item.label}</span>
                {"countKey" in item && (
                  <span className="figures ml-auto text-xs text-spine-ink-soft">
                    {counts[item.countKey]}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
