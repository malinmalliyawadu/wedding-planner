"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { inputBaseClass } from "@/components/ui";

/** Which set of choices and guest counts the ranking is measured against. */
export function CompromiseScenarioPicker({
  scenarios,
  selected,
  guestListLabel,
}: {
  scenarios: Array<{ id: number; name: string }>;
  selected: number | null;
  guestListLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-xs text-ink-soft">
      <span className="eyebrow text-ink-faint">Measured against</span>
      <select
        value={selected ?? ""}
        onChange={(e) => {
          const search = new URLSearchParams(params);
          if (e.target.value === "") search.delete("s");
          else search.set("s", e.target.value);
          router.replace(`${pathname}?${search.toString()}`, { scroll: false });
        }}
        className={`${inputBaseClass} py-1.5 text-xs`}
      >
        <option value="">{guestListLabel}</option>
        {scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
