"use client";

import { useId, useMemo, useState } from "react";
import { daysBetween, type Projection } from "@/lib/projection";
import { formatCentsWhole } from "@/lib/money";
import { formatDateShort } from "@/lib/dates";

const WIDTH = 760;
const HEIGHT = 300;
const PAD = { top: 16, right: 16, bottom: 46, left: 68 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

type Hover = { x: number; date: string; balanceCents: number };

/**
 * Projected balance from today to the wedding day, drawn as a step line:
 * the balance is flat between events and jumps on each one, which is what
 * actually happens. Above the zero line is solvent, below is overdrawn -
 * position carries the meaning, colour and hatching reinforce it.
 */
export function ProjectionChart({
  projection,
  weddingDate,
  today,
}: {
  projection: Projection;
  weddingDate: string;
  today: string;
}) {
  const clipId = useId();
  const hatchId = useId();
  const [hover, setHover] = useState<Hover | null>(null);

  const geometry = useMemo(() => {
    const span = Math.max(1, daysBetween(today, weddingDate));
    const balances = projection.points.map((p) => p.balanceCents);
    const maxBalance = Math.max(0, ...balances);
    const minBalance = Math.min(0, ...balances);
    // Pad the domain so the curve never touches the frame.
    const headroom = Math.max(1, Math.round((maxBalance - minBalance) / 10));
    const top = maxBalance + headroom;
    const bottom = minBalance - (minBalance < 0 ? headroom : 0);

    const x = (date: string) =>
      PAD.left + (Math.min(span, Math.max(0, daysBetween(today, date))) / span) * PLOT_W;
    const y = (cents: number) =>
      PAD.top + ((top - cents) / Math.max(1, top - bottom)) * PLOT_H;

    return { span, x, y, top, bottom, zeroY: y(0) };
  }, [projection.points, today, weddingDate]);

  const { x, y, zeroY } = geometry;

  // Step path: hold the balance, then jump at each event.
  const stepPoints = projection.points;
  const linePath = stepPoints
    .map((point, i) => {
      const px = x(point.date);
      const py = y(point.balanceCents);
      if (i === 0) return `M ${px} ${py}`;
      const prev = stepPoints[i - 1];
      return `L ${px} ${y(prev.balanceCents)} L ${px} ${py}`;
    })
    .join(" ");

  const areaPath = `${linePath} L ${x(weddingDate)} ${zeroY} L ${PAD.left} ${zeroY} Z`;

  const ticks = yTicks(geometry.bottom, geometry.top);
  const monthMarks = monthTicks(today, weddingDate);
  const duePayments = projection.events.filter((e) => e.kind === "payment");
  const maxPayment = Math.max(1, ...duePayments.map((p) => -p.amountCents));

  function handleMove(event: React.MouseEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const px = PAD.left + ratio * PLOT_W;
    // The balance at a given x is the last point at or before it.
    let current = stepPoints[0];
    for (const point of stepPoints) {
      if (x(point.date) <= px + 0.5) current = point;
    }
    setHover({ x: px, date: current.date, balanceCents: current.balanceCents });
  }

  const summary = `Projected balance from ${formatDateShort(today)} to ${formatDateShort(weddingDate)}, opening at ${formatCentsWhole(projection.openingBalanceCents)} and closing at ${formatCentsWhole(projection.closingBalanceCents)}. ${
    projection.firstNegativeDate
      ? `It first goes below zero on ${formatDateShort(projection.firstNegativeDate)}.`
      : "It never goes below zero."
  }`;

  return (
    <figure className="m-0">
      {/* Below the minimum width the labels stop being readable, so the
          chart scrolls rather than shrinking any further. */}
      <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full min-w-[36rem]"
        role="img"
        aria-label={summary}
      >
        <defs>
          <clipPath id={`${clipId}-above`}>
            <rect x={0} y={0} width={WIDTH} height={zeroY} />
          </clipPath>
          <clipPath id={`${clipId}-below`}>
            <rect x={0} y={zeroY} width={WIDTH} height={HEIGHT - zeroY} />
          </clipPath>
          {/* Hatching so the overdrawn region survives colour blindness,
              print and forced-colors. */}
          <pattern
            id={hatchId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="var(--color-plot-negative)"
              strokeWidth="2"
              opacity="0.5"
            />
          </pattern>
        </defs>

        {/* Horizontal grid, recessive. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              y1={y(tick)}
              x2={WIDTH - PAD.right}
              y2={y(tick)}
              stroke="var(--color-hairline)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 10}
              y={y(tick) + 3.5}
              textAnchor="end"
              className="figures"
              fontSize="10"
              fill="var(--color-ink-faint)"
            >
              {compactMoney(tick)}
            </text>
          </g>
        ))}

        {/* Month gridlines and labels. */}
        {monthMarks.map((mark) => (
          <g key={mark.date}>
            <line
              x1={x(mark.date)}
              y1={PAD.top}
              x2={x(mark.date)}
              y2={PAD.top + PLOT_H}
              stroke="var(--color-hairline)"
              strokeWidth="1"
              opacity="0.6"
            />
            <text
              x={x(mark.date)}
              y={HEIGHT - 20}
              textAnchor="middle"
              fontSize="10"
              fill="var(--color-ink-faint)"
            >
              {mark.label}
            </text>
          </g>
        ))}

        {/* The area, split exactly at zero by clip rather than by guesswork. */}
        <g clipPath={`url(#${clipId}-above)`}>
          <path d={areaPath} fill="var(--color-plot-positive)" opacity="0.14" />
        </g>
        <g clipPath={`url(#${clipId}-below)`}>
          <path d={areaPath} fill="var(--color-plot-negative)" opacity="0.16" />
          <path d={areaPath} fill={`url(#${hatchId})`} />
        </g>

        {/* Zero: the line the whole chart is about. The axis already
            labels it, so it needs no label of its own. */}
        <line
          x1={PAD.left}
          y1={zeroY}
          x2={WIDTH - PAD.right}
          y2={zeroY}
          stroke="var(--color-ink)"
          strokeWidth="1.5"
        />

        {/* The balance itself. */}
        <g clipPath={`url(#${clipId}-above)`}>
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-plot-positive)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
        <g clipPath={`url(#${clipId}-below)`}>
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-plot-negative)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>

        {/* Payments due, as ticks under the axis: taller means dearer. */}
        {duePayments.map((payment, i) => {
          const height = (-payment.amountCents / maxPayment) * 16 + 3;
          return (
            <line
              key={`${payment.date}-${i}`}
              x1={x(payment.date)}
              y1={PAD.top + PLOT_H + 4}
              x2={x(payment.date)}
              y2={PAD.top + PLOT_H + 4 + height}
              stroke="var(--color-ink-faint)"
              strokeWidth="1.5"
            />
          );
        })}

        {/* The first shortfall, named on the chart rather than in a key. */}
        {projection.firstNegativeDate && (
          <g>
            <line
              x1={x(projection.firstNegativeDate)}
              y1={PAD.top}
              x2={x(projection.firstNegativeDate)}
              y2={PAD.top + PLOT_H}
              stroke="var(--color-plot-negative)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            <text
              x={Math.min(x(projection.firstNegativeDate) + 6, WIDTH - PAD.right - 4)}
              y={PAD.top + 12}
              textAnchor={
                x(projection.firstNegativeDate) > WIDTH - 160 ? "end" : "start"
              }
              fontSize="10"
              fontWeight="600"
              fill="var(--color-plot-negative)"
            >
              Short from {formatDateShort(projection.firstNegativeDate)}
            </text>
          </g>
        )}

        {/* Crosshair. */}
        {hover && (
          <g pointerEvents="none">
            <line
              x1={hover.x}
              y1={PAD.top}
              x2={hover.x}
              y2={PAD.top + PLOT_H}
              stroke="var(--color-ink-soft)"
              strokeWidth="1"
            />
            <circle
              cx={hover.x}
              cy={y(hover.balanceCents)}
              r="4"
              fill={
                hover.balanceCents < 0
                  ? "var(--color-plot-negative)"
                  : "var(--color-plot-positive)"
              }
              stroke="var(--color-card)"
              strokeWidth="2"
            />
          </g>
        )}

        <rect
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-soft">
        <span className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-0.5 w-4 rounded-full"
              style={{ background: "var(--color-plot-positive)" }}
            />
            In credit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-0.5 w-4 rounded-full"
              style={{ background: "var(--color-plot-negative)" }}
            />
            Overdrawn
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-px bg-ink-faint" />
            Payment due
          </span>
        </span>
        {hover && (
          <span aria-live="polite" className="figures">
            {formatDateShort(hover.date)} ·{" "}
            <span
              className={hover.balanceCents < 0 ? "text-madder" : "text-ink"}
            >
              {formatCentsWhole(hover.balanceCents)}
            </span>
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * Round numbers spanning the domain, always including zero. The ladder is
 * deliberately fine-grained: a coarser one rounds a step up a whole decade
 * and leaves the axis with two labels.
 */
function yTicks(bottom: number, top: number): number[] {
  const span = top - bottom;
  if (span <= 0) return [0];
  const rough = span / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step =
    [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]
      .map((m) => m * magnitude)
      .find((s) => s >= rough) ?? magnitude * 10;

  const ticks: number[] = [];
  for (let v = Math.ceil(bottom / step) * step; v <= top; v += step) {
    ticks.push(Math.round(v));
  }
  if (!ticks.includes(0) && bottom <= 0 && top >= 0) ticks.push(0);
  return ticks;
}

/** "$12k" style labels for the axis, where precision is noise. */
function compactMoney(cents: number): string {
  const dollars = Math.round(cents / 100);
  if (dollars === 0) return "$0";
  const sign = dollars < 0 ? "−" : "";
  const abs = Math.abs(dollars);
  if (abs >= 1000) return `${sign}$${Math.round(abs / 100) / 10}k`;
  return `${sign}$${abs}`;
}

function monthTicks(from: string, to: string): Array<{ date: string; label: string }> {
  const [fy, fm] = from.split("-").map(Number);
  const marks: Array<{ date: string; label: string }> = [];
  let year = fy;
  let month = fm;
  const total = daysBetween(from, to);
  // Thin the labels out on long horizons so they never collide.
  const stride = total > 400 ? 3 : total > 200 ? 2 : 1;

  for (let i = 0; i < 60; i++) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const date = `${year}-${String(month).padStart(2, "0")}-01`;
    if (date > to) break;
    if (i % stride === 0) {
      marks.push({
        date,
        label: new Intl.DateTimeFormat("en-NZ", {
          timeZone: "UTC",
          month: "short",
        }).format(new Date(`${date}T12:00:00Z`)),
      });
    }
  }
  return marks;
}
