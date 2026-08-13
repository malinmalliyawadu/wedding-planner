"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Slider } from "@/components/slider";
import { Chip } from "@/components/ui";
import { formatDateShort } from "@/lib/dates";
import { formatCentsWhole } from "@/lib/money";
import { formatTime } from "@/lib/run-sheet";
import {
  costOrder,
  evaluateVenues,
  type CapacityFit,
  type GuestCounts,
  type VenueBlocker,
  type VenueEvaluation,
} from "@/lib/venues";
import { deleteVenue } from "./actions";
import { STATUS_LABELS, STATUS_TONES } from "./status";
import { VenueDialog, type VenueValues } from "./venue-dialog";

export function VenueComparison({
  venues,
  guestListCounts,
}: {
  venues: VenueValues[];
  guestListCounts: GuestCounts;
}) {
  // Venue hunting happens long before the RSVPs land, so the guest list is
  // only the starting point: the whole comparison recomputes as these move,
  // which is how you find out that the barn works at 90 and not at 110.
  const [counts, setCounts] = useState(guestListCounts);

  const comparison = useMemo(
    () => evaluateVenues(venues, counts),
    [venues, counts],
  );
  const ordered = useMemo(
    () => costOrder(comparison.evaluations),
    [comparison],
  );

  const cheapest = ordered.find((e) => e.venue.id === comparison.cheapestId);
  const viableCount = ordered.filter((e) => e.viable).length;

  return (
    <>
      <section className="rounded-lg border border-hairline bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow text-brass">
              {cheapest ? `Cheapest that works: ${cheapest.venue.name}` : "Nothing bookable yet"}
            </p>
            <p className="figures mt-1 text-5xl leading-none tabular-nums">
              {cheapest ? formatCentsWhole(cheapest.cost.totalCents) : "—"}
            </p>
          </div>
          <dl className="flex gap-8 text-right">
            <div>
              <dd className="figures text-lg">
                {comparison.spreadCents === 0
                  ? "—"
                  : formatCentsWhole(comparison.spreadCents)}
              </dd>
              <dt className="eyebrow mt-0.5 text-ink-faint">Cheapest to dearest</dt>
            </div>
            <div>
              <dd className="figures text-lg">
                {viableCount}/{ordered.length}
              </dd>
              <dt className="eyebrow mt-0.5 text-ink-faint">You could book</dt>
            </div>
          </dl>
        </div>

        <p className="mt-4 max-w-2xl text-xs text-ink-soft">
          {comparison.spreadCents > 0 ? (
            <>
              Choosing the cheaper end of this list is worth{" "}
              <span className="figures text-ink">
                {formatCentsWhole(comparison.spreadCents)}
              </span>{" "}
              at {counts.adults} adults and {counts.children} children - which is
              the only part of this decision a table can settle. The rest is in
              the notes.
            </>
          ) : viableCount === 0 ? (
            <>
              Nothing here works at {counts.adults} adults and {counts.children}{" "}
              children. Move the numbers and see what comes back into range.
            </>
          ) : viableCount === 1 ? (
            <>
              Only one of these works at {counts.adults} adults and{" "}
              {counts.children} children, so there is no choice left to price.
            </>
          ) : (
            "These come to the same money at this guest count, so decide it on the notes."
          )}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-hairline pt-5 sm:grid-cols-2">
          <CountSlider
            label="Adults"
            value={counts.adults}
            max={200}
            tone="sage"
            onChange={(adults) => setCounts((c) => ({ ...c, adults }))}
          />
          <CountSlider
            label="Children"
            value={counts.children}
            max={60}
            tone="rose"
            onChange={(children) => setCounts((c) => ({ ...c, children }))}
          />
        </div>
      </section>

      <div className="mt-6 overflow-x-auto rounded-lg border border-hairline bg-card shadow-card">
        <table className="w-full min-w-4xl text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                Venue
              </th>
              <th className="eyebrow px-3 py-3 font-semibold text-ink-faint">
                Seats
              </th>
              <th className="eyebrow px-3 py-3 font-semibold text-ink-faint">
                Our date
              </th>
              <th className="eyebrow px-4 py-3 text-right font-semibold text-ink-faint">
                Total
              </th>
              <th className="eyebrow px-3 py-3 text-right font-semibold text-ink-faint">
                Per guest
              </th>
              <th className="eyebrow px-4 py-3 text-right font-semibold text-ink-faint">
                vs cheapest
              </th>
              <th className="px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((evaluation) => (
              <VenueRow
                key={evaluation.venue.id}
                evaluation={evaluation}
                isCheapest={evaluation.venue.id === comparison.cheapestId}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-ink-soft">
        Compared at <span className="figures">{counts.adults}</span> adults and{" "}
        <span className="figures">{counts.children}</span> children. Infants are
        free and sit on laps, so they count towards neither the bill nor the
        chairs.
      </p>
    </>
  );
}

function VenueRow({
  evaluation,
  isCheapest,
}: {
  evaluation: VenueEvaluation<VenueValues>;
  isCheapest: boolean;
}) {
  const { venue, cost, fit, blockers, viable } = evaluation;

  const detail = [
    venue.locality,
    venue.travelMinutes !== null ? `${venue.travelMinutes} min away` : null,
    venue.curfew !== null ? `${formatTime(venue.curfew)} curfew` : null,
    venue.siteVisitDate !== null
      ? `Visited ${formatDateShort(venue.siteVisitDate)}`
      : null,
  ].filter((s): s is string => s !== null);

  return (
    <tr
      // `group` is what reveals .row-actions on a pointer that can hover;
      // without it the edit and delete buttons stay at opacity 0 forever.
      className={`group border-b border-hairline/60 transition-colors duration-150 last:border-0 hover:bg-brass-tint/25 ${
        viable ? "" : "opacity-45"
      }`}
    >
      <td className="px-4 py-3 align-top">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{venue.name}</span>
          <Chip tone={STATUS_TONES[venue.status]}>
            {STATUS_LABELS[venue.status]}
          </Chip>
          {venue.url !== null && (
            <a
              href={venue.url}
              target="_blank"
              rel="noreferrer"
              className="text-ink-faint transition-colors duration-150 hover:text-brass"
              aria-label={`${venue.name} website`}
            >
              <ExternalLink size={13} aria-hidden />
            </a>
          )}
        </div>
        {detail.length > 0 && (
          <span className="mt-0.5 block text-xs text-ink-faint">
            {detail.join(" · ")}
          </span>
        )}
        {blockers.map((blocker) => (
          <span
            key={blocker.kind}
            className={`mt-1 block text-xs ${
              // A gap in the record is not a mark against the place, and
              // should not be dressed in the same red as one.
              blocker.kind === "capacity_unknown"
                ? "text-ink-faint"
                : "font-medium text-madder"
            }`}
          >
            {blockerText(blocker)}
          </span>
        ))}
        {venue.notes !== null && (
          <span className="mt-1 block max-w-md text-xs leading-relaxed text-ink-soft">
            {venue.notes}
          </span>
        )}
      </td>

      <td className="px-3 py-3 align-top">
        <SeatsCell fit={fit} />
      </td>

      <td className="px-3 py-3 align-top text-xs">
        {venue.dateAvailable === true ? (
          <span className="text-fern">Free</span>
        ) : venue.dateAvailable === false ? (
          <span className="font-medium text-madder">Taken</span>
        ) : (
          <span className="text-ink-faint">Not asked</span>
        )}
      </td>

      <td className="px-4 py-3 text-right align-top">
        <span className="figures font-medium">
          {formatCentsWhole(cost.totalCents)}
        </span>
        <span className="mt-0.5 block text-xs whitespace-nowrap text-ink-faint">
          {formatCentsWhole(cost.hireCents)} hire +{" "}
          {formatCentsWhole(cost.cateringCents + cost.minimumTopUpCents)} catering
        </span>
        {cost.minimumTopUpCents > 0 && (
          <span className="mt-1 block text-xs text-brass">
            {formatCentsWhole(cost.minimumTopUpCents)} of that is minimum spend
            {evaluation.breakEvenAdults !== null
              ? ` · clears at ${evaluation.breakEvenAdults} adults`
              : " · no guest count clears it"}
          </span>
        )}
      </td>

      <td className="figures px-3 py-3 text-right align-top text-ink-soft">
        {formatCentsWhole(cost.perGuestCents)}
      </td>

      <td className="px-4 py-3 text-right align-top">
        {isCheapest ? (
          <Chip tone="fern">Cheapest</Chip>
        ) : evaluation.deltaFromCheapestCents === 0 ? (
          <span className="text-xs text-ink-faint">—</span>
        ) : (
          <span
            className={`figures text-xs ${
              evaluation.deltaFromCheapestCents > 0 ? "text-ink-soft" : "text-fern"
            }`}
          >
            {evaluation.deltaFromCheapestCents > 0 ? "+" : "−"}
            {formatCentsWhole(Math.abs(evaluation.deltaFromCheapestCents))}
          </span>
        )}
      </td>

      <td className="px-4 py-3 align-top">
        <div className="row-actions flex justify-end gap-0.5">
          <VenueDialog venue={venue} />
          <DeleteButton
            action={deleteVenue.bind(null, venue.id)}
            label={`Delete ${venue.name}`}
          />
        </div>
      </td>
    </tr>
  );
}

function SeatsCell({ fit }: { fit: CapacityFit }) {
  if (fit.verdict === "unknown") {
    return <span className="text-xs text-ink-faint">Not recorded</span>;
  }

  const spare = fit.spareSeats ?? 0;
  const tone =
    fit.verdict === "over"
      ? "text-madder"
      : fit.verdict === "tight"
        ? "text-brass"
        : "text-ink-soft";

  return (
    <>
      <span className="figures text-sm">{fit.seatedCapacity}</span>
      <span className={`mt-0.5 block text-xs whitespace-nowrap ${tone}`}>
        {fit.verdict === "over"
          ? `${-spare} too many`
          : fit.verdict === "tight"
            ? `${spare} spare - tight`
            : `${spare} spare`}
      </span>
    </>
  );
}

function blockerText(blocker: VenueBlocker): string {
  switch (blocker.kind) {
    case "over_capacity":
      return `Seats ${blocker.shortSeats} fewer than you are inviting`;
    case "date_unavailable":
      return "Your date is already taken";
    case "capacity_unknown":
      return "Ask what it seats - until then it cannot be compared on fit";
  }
}

function CountSlider({
  label,
  value,
  max,
  tone,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  tone: "sage" | "rose";
  onChange: (value: number) => void;
}) {
  const id = `venue-count-${label.toLowerCase()}`;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="text-xs font-semibold tracking-wide text-ink-soft"
        >
          {label}
        </label>
        <span className="figures text-xl">{value}</span>
      </div>
      <Slider
        id={id}
        value={value}
        max={max}
        tone={tone}
        valueText={`${value} ${label.toLowerCase()}`}
        onChange={onChange}
      />
    </div>
  );
}
