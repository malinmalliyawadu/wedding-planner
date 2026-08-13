"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/select";

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
    <div className="flex min-w-0 items-center gap-2 text-xs text-ink-soft">
      <span className="eyebrow shrink-0 text-ink-faint">Measured against</span>
      <Select
        label="Which scenario the ranking is measured against"
        size="sm"
        width="auto"
        value={selected === null ? "" : String(selected)}
        onChange={(value) => {
          const search = new URLSearchParams(params);
          if (value === "") search.delete("s");
          else search.set("s", value);
          router.replace(`${pathname}?${search.toString()}`, { scroll: false });
        }}
        options={[
          { value: "", label: guestListLabel },
          ...scenarios.map((s) => ({ value: String(s.id), label: s.name })),
        ]}
      />
    </div>
  );
}
