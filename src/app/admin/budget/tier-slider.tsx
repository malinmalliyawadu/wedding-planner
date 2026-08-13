"use client";

import { Slider } from "@/components/slider";
import {
  activeTierIndex,
  tierStops,
  type BudgetItem,
  type ItemChoice,
} from "@/lib/budget";

/**
 * Discrete slider across an item's tiers. A native range input keeps
 * arrow-key control and screen-reader announcements for free; the label
 * beside it names the stop the handle is sitting on.
 */
export function TierSlider({
  item,
  choice,
  disabled,
  onChange,
}: {
  item: BudgetItem;
  choice: ItemChoice;
  disabled: boolean;
  onChange: (itemOptionId: number | null) => void;
}) {
  const stops = tierStops(item);
  if (stops.length < 2) return null;

  const index = activeTierIndex(item, choice);
  const current = stops[index];

  return (
    <div className="flex items-center gap-2.5">
      <span className="w-20 shrink-0">
        <Slider
          value={index}
          max={stops.length - 1}
          size="sm"
          tone="brass"
          label={`${item.name} tier`}
          valueText={current.label}
          disabled={disabled}
          onChange={(next) => onChange(stops[next].option?.id ?? null)}
        />
      </span>
      <span
        className={`truncate text-xs ${disabled ? "text-ink-faint line-through" : "text-ink-soft"}`}
        title={current.label}
      >
        {current.label}
      </span>
    </div>
  );
}
