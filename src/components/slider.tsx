"use client";

import type { CSSProperties } from "react";

/**
 * Range input with a hairline track and a comfortable hit area. The
 * travelled part of the track is painted via the --fill custom property
 * so the control reads as a progress bar as well as a slider.
 */
export function Slider({
  value,
  min = 0,
  max,
  size = "md",
  tone = "ink",
  label,
  valueText,
  disabled,
  onChange,
  id,
}: {
  value: number;
  min?: number;
  max: number;
  size?: "md" | "sm";
  tone?: "ink" | "sage" | "rose" | "brass";
  /** Used as aria-label when the control has no visible <label>. */
  label?: string;
  /** What a screen reader should read instead of the raw number. */
  valueText?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  id?: string;
}) {
  const span = max - min;
  const fill = span === 0 ? 0 : ((value - min) / span) * 100;

  const tones: Record<string, string> = {
    ink: "var(--color-ink)",
    sage: "var(--color-sage)",
    rose: "var(--color-rose)",
    brass: "var(--color-brass)",
  };

  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      disabled={disabled}
      aria-label={label}
      aria-valuetext={valueText}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`slider ${size === "sm" ? "slider-sm" : ""}`}
      style={
        {
          "--fill": `${fill}%`,
          "--thumb": tones[tone],
          "--track-fill": tones[tone],
        } as CSSProperties
      }
    />
  );
}
