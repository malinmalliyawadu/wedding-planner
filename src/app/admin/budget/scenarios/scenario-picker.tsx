"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Which scenarios sit side by side. Capped at three - beyond that the
 * columns stop being readable and the comparison stops being useful.
 */
export function ScenarioPicker({
  scenarios,
  selected,
}: {
  scenarios: Array<{ id: number; name: string }>;
  selected: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function toggle(id: number) {
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id].slice(-3);
    const search = new URLSearchParams(params);
    search.delete("s");
    for (const value of next) search.append("s", String(value));
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {scenarios.map((scenario) => {
        const active = selected.includes(scenario.id);
        const position = selected.indexOf(scenario.id);
        return (
          <button
            key={scenario.id}
            onClick={() => toggle(scenario.id)}
            aria-pressed={active}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-150 ${
              active
                ? "border-ink bg-ink text-paper"
                : "border-hairline-strong bg-card text-ink-soft hover:border-ink-faint hover:text-ink"
            }`}
          >
            {active && (
              <span className="figures text-[0.65rem] opacity-70">
                {position === 0 ? "base" : `+${position}`}
              </span>
            )}
            {scenario.name}
          </button>
        );
      })}
    </div>
  );
}
