"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { inputBaseClass } from "@/components/ui";
import { parseView, VIEWS, type View } from "./views";

/** The view switch and the search, both backed by the URL. */
export function InvitationFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = parseView(params.get("show"));

  function hrefFor(view: View): string {
    const next = new URLSearchParams(params);
    if (view === "all") next.delete("show");
    else next.set("show", view);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function setSearch(value: string) {
    const next = new URLSearchParams(params);
    if (value === "") next.delete("q");
    else next.set("q", value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Which households" className="flex gap-1">
        {VIEWS.map((view) => {
          const active = view.value === current;
          return (
            <Link
              key={view.value}
              href={hrefFor(view.value)}
              replace
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 pointer-coarse:min-h-11 pointer-coarse:inline-flex pointer-coarse:items-center ${
                active
                  ? "bg-ink text-paper"
                  : "text-ink-soft hover:bg-brass-tint/60 hover:text-ink"
              }`}
            >
              {view.label}
            </Link>
          );
        })}
      </nav>

      <div className="relative w-full sm:w-56">
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint"
        />
        <input
          type="search"
          aria-label="Search households"
          placeholder="Search households…"
          defaultValue={params.get("q") ?? ""}
          onChange={(event) => setSearch(event.target.value.trim())}
          className={`${inputBaseClass} w-full py-1.5 pl-8 text-xs`}
        />
      </div>
    </div>
  );
}
