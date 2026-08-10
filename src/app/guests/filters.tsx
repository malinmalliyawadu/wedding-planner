"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Select } from "@/components/select";
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* The search takes its own line on a phone; the three filters share one. */}
      <div className="relative w-full sm:w-56">
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
          className={`${inputBaseClass} w-full py-1.5 pl-8 text-xs`}
        />
      </div>
      <Select
        label="Filter by side"
        size="sm"
        width="auto"
        value={params.get("side") ?? ""}
        onChange={(value) => setParam("side", value)}
        options={[
          { value: "", label: "Either side" },
          { value: "a", label: `${nameA}’s side` },
          { value: "b", label: `${nameB}’s side` },
          { value: "both", label: "Both" },
        ]}
      />
      <Select
        label="Filter by RSVP"
        size="sm"
        width="auto"
        value={params.get("rsvp") ?? ""}
        onChange={(value) => setParam("rsvp", value)}
        options={[
          { value: "", label: "Any RSVP" },
          { value: "attending", label: "Attending" },
          { value: "pending", label: "Pending" },
          { value: "declined", label: "Declined" },
        ]}
      />
      <Select
        label="Filter by age"
        size="sm"
        width="auto"
        value={params.get("age") ?? ""}
        onChange={(value) => setParam("age", value)}
        options={[
          { value: "", label: "All ages" },
          { value: "adult", label: "Adults" },
          { value: "child", label: "Children" },
          { value: "infant", label: "Infants" },
        ]}
      />
    </div>
  );
}
