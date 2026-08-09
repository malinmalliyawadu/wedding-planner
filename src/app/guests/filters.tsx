"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { inputBaseClass } from "@/components/ui";

/**
 * Filter bar backed by the URL, so filtered views survive reloads and
 * can be shared between the two of us.
 */
export function GuestFilters({ nameA, nameB }: { nameA: string; nameB: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === "") next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const selectClass = `${inputBaseClass} py-1.5 text-xs`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint"
        />
        <input
          type="search"
          aria-label="Search guests"
          placeholder="Search guests…"
          defaultValue={params.get("q") ?? ""}
          onChange={(e) => setParam("q", e.target.value.trim())}
          className={`${inputBaseClass} w-56 py-1.5 pl-8 text-xs`}
        />
      </div>
      <select
        aria-label="Filter by side"
        value={params.get("side") ?? ""}
        onChange={(e) => setParam("side", e.target.value)}
        className={selectClass}
      >
        <option value="">Either side</option>
        <option value="a">{nameA}&rsquo;s side</option>
        <option value="b">{nameB}&rsquo;s side</option>
        <option value="both">Both</option>
      </select>
      <select
        aria-label="Filter by RSVP"
        value={params.get("rsvp") ?? ""}
        onChange={(e) => setParam("rsvp", e.target.value)}
        className={selectClass}
      >
        <option value="">Any RSVP</option>
        <option value="attending">Attending</option>
        <option value="pending">Pending</option>
        <option value="declined">Declined</option>
      </select>
      <select
        aria-label="Filter by age"
        value={params.get("age") ?? ""}
        onChange={(e) => setParam("age", e.target.value)}
        className={selectClass}
      >
        <option value="">All ages</option>
        <option value="adult">Adults</option>
        <option value="child">Children</option>
        <option value="infant">Infants</option>
      </select>
    </div>
  );
}
