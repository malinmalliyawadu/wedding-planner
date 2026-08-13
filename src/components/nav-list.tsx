"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Armchair,
  CalendarDays,
  ClipboardList,
  Images,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  Mail,
  MailOpen,
  PiggyBank,
  Scale,
  Users,
} from "lucide-react";

/**
 * The planner lives under /admin so that `/` can be the guests' landing
 * page. Nothing here is reachable without the password.
 */
const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/guests", label: "Guests", icon: Users, countKey: "guests" },
  { href: "/admin/households", label: "Households", icon: Mail, countKey: "households" },
  { href: "/admin/invitations", label: "Invitations", icon: MailOpen },
  { href: "/admin/photos", label: "Photographs", icon: Images },
  { href: "/admin/tables", label: "Tables", icon: Armchair, countKey: "tables" },
  { href: "/admin/seating", label: "Seating", icon: LayoutGrid },
  { href: "/admin/venues", label: "Venues", icon: Landmark },
  { href: "/admin/budget", label: "Budget", icon: Scale },
  { href: "/admin/savings", label: "Savings", icon: PiggyBank },
  { href: "/admin/timeline", label: "Timeline", icon: CalendarDays },
  { href: "/admin/run-sheet", label: "Run sheet", icon: ClipboardList },
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
          // The overview is only current on its own path; every other
          // item also lights up for its children, so /admin/guests/import
          // still shows Guests as the section you are in.
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
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
