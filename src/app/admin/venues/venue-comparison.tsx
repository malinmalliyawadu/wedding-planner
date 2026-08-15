"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, ChevronUp, ExternalLink } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Slider } from "@/components/slider";
import { Chip } from "@/components/ui";
import { formatDateShort } from "@/lib/dates";
import { formatCents, formatCentsWhole } from "@/lib/money";
import { formatTime } from "@/lib/run-sheet";
import {
  evaluateVenues,
  venueOrder,
  type CapacityFit,
  type CateringAssumption,
  type GuestCounts,
  type SortDirection,
  type VenueBlocker,
  type VenueEvaluation,
  type VenueSort,
  type VenueSortKey,
} from "@/lib/venues";
import {
  MIN_COMPARISONS_PER_VENUE,
  rankVenues,
  type Comparison,
} from "@/lib/venue-ranking";
import { deleteVenue } from "./actions";
import { STATUS_LABELS, STATUS_TONES } from "./status";
import { VenueDetail } from "./venue-detail";
import { VenueDialog, type VenueValues } from "./venue-dialog";

export function VenueComparison({
  venues,
  comparisons,
  guestListCounts,
  catering,
}: {
  venues: VenueValues[];
  comparisons: Comparison[];
  guestListCounts: GuestCounts;
  catering: CateringAssumption;
}) {
  // Venue hunting happens long before the RSVPs land, so the guest list is
  // only the starting point: the whole comparison recomputes as these move,
  // which is how you find out that the barn works at 90 and not at 110.
  const [counts, setCounts] = useState(guestListCounts);
  // Rank first, because "which do we want" is the question you came with
  // and the money is what you check it against. With nothing compared yet
  // every venue is unranked, and the order falls through to cheapest
  // first - exactly the table this page has always shown.
  const [sort, setSort] = useState<VenueSort>({
    key: "rank",
    direction: "asc",
  });

  const comparison = useMemo(
    () => evaluateVenues(venues, counts, catering),
    [venues, counts, catering],
  );

  // The ranking does not depend on the guest count, so this survives the
  // sliders moving. Ranks are 1-based with ties sharing a number; a venue
  // nobody has compared has none, which sinks it in a rank sort.
  const ranking = useMemo(
    () => rankVenues(venues, comparisons),
    [venues, comparisons],
  );
  const ranks = useMemo(() => {
    const byId = new Map<number, RankInfo>();
    for (const entry of ranking.ranked) {
      byId.set(entry.venue.id, {
        rank: entry.rank,
        comparisons: entry.comparisons,
        provisional: entry.provisional,
      });
    }
    return byId;
  }, [ranking]);

  const ordered = useMemo(
    () =>
      venueOrder(
        comparison.evaluations,
        sort,
        (id) => ranks.get(id)?.rank ?? null,
      ),
    [comparison, sort, ranks],
  );

  const toggleSort = (key: VenueSortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: defaultDirection(key) },
    );

  const cheapest = ordered.find((e) => e.venue.id === comparison.cheapestId);
  const viableCount = ordered.filter((e) => e.viable).length;
  const assumedCount = ordered.filter((e) => e.cost.cateringAssumed).length;
  const unquotedCount = ordered.filter((e) => e.cost.hireUnknown).length;

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
            {cheapest?.cost.cateringAssumed && (
              // The headline is the number that gets quoted at each other
              // over dinner, so it says out loud when part of it is ours
              // rather than theirs.
              <p className="mt-1.5 text-xs text-brass">
                Includes an estimated caterer
              </p>
            )}
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

        {unquotedCount > 0 && (
          // The other half of the same principle as the caterer below,
          // arrived at from the other end: that gap can be filled with a
          // defensible number and this one cannot, so this one is left
          // open and the venue waits at the bottom until you ring them.
          <p className="mt-3 max-w-2xl text-xs text-ink-soft">
            <span className="figures text-ink">{unquotedCount}</span> of these
            {unquotedCount === 1 ? " has" : " have"} no hire fee yet, so
            {unquotedCount === 1 ? " its total is" : " their totals are"} the
            food and nothing else. They wait at the bottom of the list rather
            than winning it on a blank - a room whose price you have not asked
            is the one number here that cannot be estimated.
          </p>
        )}

        {assumedCount > 0 && (
          // Half a shortlist quotes a per-head rate and half is dry hire.
          // Comparing those on the venue's own bill makes a bare hall look
          // a tenth of the price of a homestead, when the real difference
          // is who invoices you for the dinner - so the caterer is priced
          // in, and said out loud rather than buried in the arithmetic.
          <p className="mt-3 max-w-2xl text-xs text-ink-soft">
            {assumedCount === 1
              ? "One of these quotes no per-head rate, so its total prices"
              : `${assumedCount} of these quote no per-head rate, so their totals price`}{" "}
            an outside caterer at{" "}
            <span className="figures text-ink">
              {formatCents(catering.perHeadCents)}
            </span>{" "}
            a head
            {catering.perChildCents !== null && (
              <>
                {" "}
                and{" "}
                <span className="figures text-ink">
                  {formatCents(catering.perChildCents)}
                </span>{" "}
                a child
              </>
            )}
            . That is an assumption, not a quote -{" "}
            <Link
              href="/admin/settings"
              className="text-brass underline decoration-hairline-strong underline-offset-2 transition-colors duration-150 hover:decoration-brass"
            >
              change it in settings
            </Link>{" "}
            once you have rung a caterer.
          </p>
        )}

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
              <SortHeader
                sortKey="rank"
                sort={sort}
                onSort={toggleSort}
                align="right"
                className="px-4"
              >
                #
              </SortHeader>
              <SortHeader
                sortKey="name"
                sort={sort}
                onSort={toggleSort}
                className="px-4"
              >
                Venue
              </SortHeader>
              <SortHeader sortKey="seats" sort={sort} onSort={toggleSort}>
                Seats
              </SortHeader>
              <SortHeader
                sortKey="total"
                sort={sort}
                onSort={toggleSort}
                align="right"
                className="px-4"
              >
                Total
              </SortHeader>
              <SortHeader
                sortKey="perGuest"
                sort={sort}
                onSort={toggleSort}
                align="right"
              >
                Per guest
              </SortHeader>
              <SortHeader
                sortKey="delta"
                sort={sort}
                onSort={toggleSort}
                align="right"
                className="px-4"
              >
                vs cheapest
              </SortHeader>
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
                counts={counts}
                rank={ranks.get(evaluation.venue.id)}
                isCheapest={evaluation.venue.id === comparison.cheapestId}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-3xl text-xs text-ink-soft">
        Compared at <span className="figures">{counts.adults}</span> adults and{" "}
        <span className="figures">{counts.children}</span> children. Infants are
        free and sit on laps, so they count towards neither the bill nor the
        chairs. Any heading sorts, and venues you could book stay above ones
        you could not whichever you pick. Open a venue&rsquo;s name for the
        whole record: the arithmetic behind its total, whether the date is
        free, the address, and the notes in full.
      </p>

      <p className="mt-2 max-w-3xl text-xs text-ink-soft">
        {ranking.comparisonsMade === 0 ? (
          <>
            Nothing is ranked yet, so <span className="figures">#</span> is
            empty and the table falls back to cheapest first.{" "}
            <Link
              href="/admin/venues/rank"
              className="text-brass underline decoration-hairline-strong underline-offset-2 transition-colors duration-150 hover:decoration-brass"
            >
              Rank them two at a time
            </Link>{" "}
            and this column fills in.
          </>
        ) : (
          <>
            <span className="figures text-ink">#</span> is your own order, from{" "}
            <span className="figures text-ink">{ranking.comparisonsMade}</span>{" "}
            head-to-head{ranking.comparisonsMade === 1 ? "" : "s"} - a faint
            number is still provisional, and a dash is a venue neither of you
            has compared with anything, which is not the same as a poor one.{" "}
            <Link
              href="/admin/venues/rank"
              className="text-brass underline decoration-hairline-strong underline-offset-2 transition-colors duration-150 hover:decoration-brass"
            >
              Keep ranking
            </Link>
            {ranking.islands.length > 1 && (
              <>
                {" "}
                - and note your answers still make{" "}
                <span className="figures text-ink">
                  {ranking.islands.length}
                </span>{" "}
                groups that have never been compared with each other, so this
                column is that many separate orders until they join up
              </>
            )}
            .
          </>
        )}
      </p>
    </>
  );
}

/** What the rank column shows for one venue, from `rankVenues`. */
type RankInfo = {
  /** Null when nobody has compared it: it has no rank, rather than a poor one. */
  rank: number | null;
  comparisons: number;
  provisional: boolean;
};

/**
 * Which way round a column reads first.
 *
 * Best-first every time, which is ascending for a rank or a price and
 * descending for a room's capacity - clicking "Seats" to be shown the
 * smallest room first is nobody's intention.
 */
function defaultDirection(key: VenueSortKey): SortDirection {
  return key === "seats" ? "desc" : "asc";
}

function SortHeader({
  sortKey,
  sort,
  onSort,
  align = "left",
  className = "",
  children,
}: {
  sortKey: VenueSortKey;
  sort: VenueSort;
  onSort: (key: VenueSortKey) => void;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  const active = sort.key === sortKey;
  const ascending = sort.direction === "asc";

  return (
    <th
      // The platform's own word for it, so a screen reader announces the
      // sort rather than the arrow being decoration only sighted users get.
      aria-sort={
        active ? (ascending ? "ascending" : "descending") : "none"
      }
      className={`eyebrow py-0 font-semibold text-ink-faint ${
        align === "right" ? "text-right" : "text-left"
      } ${className || "px-3"}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group/sort -mx-1 inline-flex w-[calc(100%+0.5rem)] items-center gap-1 rounded px-1 py-3 whitespace-nowrap transition-colors duration-150 hover:text-ink ${
          align === "right" ? "justify-end" : ""
        } ${active ? "text-ink" : ""}`}
      >
        {children}
        {/* Always rendered, at a quarter opacity until the column is the
            one in use: a chevron that appears on hover is invisible on a
            phone, and one that appears only when active leaves you
            guessing which headers do anything. */}
        <ChevronUp
          size={11}
          aria-hidden
          className={`shrink-0 transition-all duration-150 group-hover/sort:opacity-70 ${
            active ? "opacity-100" : "opacity-25"
          } ${active && !ascending ? "rotate-180" : ""}`}
        />
      </button>
    </th>
  );
}

function RankCell({ rank }: { rank: RankInfo | undefined }) {
  if (rank === undefined || rank.rank === null) {
    return (
      <td className="px-4 py-3 text-right align-top">
        <span
          className="text-xs text-ink-faint"
          title="Not compared with anything yet, so it has no ranking - not a poor one"
        >
          —
        </span>
      </td>
    );
  }

  return (
    <td className="px-4 py-3 text-right align-top">
      <span
        className={`figures ${rank.provisional ? "text-ink-faint" : ""}`}
        title={
          rank.provisional
            ? `Provisional: ${rank.comparisons} of ${MIN_COMPARISONS_PER_VENUE} answers so far`
            : `Settled over ${rank.comparisons} answers`
        }
      >
        {rank.rank}
      </span>
    </td>
  );
}

function VenueRow({
  evaluation,
  counts,
  rank,
  isCheapest,
}: {
  evaluation: VenueEvaluation<VenueValues>;
  counts: GuestCounts;
  rank: RankInfo | undefined;
  isCheapest: boolean;
}) {
  // The table carries the six facts that decide between venues; everything
  // else about a place - the address, the standing capacity, what the hire
  // fee covers, the arithmetic behind the total - lives one tap down, so
  // the comparison stays scannable without any of the record being lost.
  const [open, setOpen] = useState(false);
  const { venue, cost, fit, blockers, viable } = evaluation;
  const panelId = `venue-detail-${venue.id}`;

  const detail = [
    venue.locality,
    venue.travelMinutes !== null ? `${venue.travelMinutes} min away` : null,
    venue.curfew !== null ? `${formatTime(venue.curfew)} curfew` : null,
    venue.siteVisitDate !== null
      ? `Visited ${formatDateShort(venue.siteVisitDate)}`
      : null,
  ].filter((s): s is string => s !== null);

  return (
    <>
      <tr
        // `group` is what reveals .row-actions on a pointer that can hover;
        // without it the edit and delete buttons stay at opacity 0 forever.
        className={`group border-b border-hairline/60 transition-colors duration-150 last:border-0 hover:bg-brass-tint/25 ${
          open ? "bg-brass-tint/20" : ""
        } ${viable ? "" : "opacity-45"}`}
      >
        <RankCell rank={rank} />

        <td className="px-4 py-3 align-top">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Name and its website link travel together, so a narrow column
                wraps the status chip underneath rather than orphaning an
                icon on a line of its own. */}
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((wasOpen) => !wasOpen)}
                className="group/disclose -ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left font-medium transition-colors duration-150 hover:text-brass pointer-coarse:min-h-11"
              >
                <ChevronRight
                  size={13}
                  aria-hidden
                  className={`shrink-0 text-ink-faint transition-transform duration-150 group-hover/disclose:text-brass ${
                    open ? "rotate-90" : ""
                  }`}
                />
                {venue.name}
              </button>
              {venue.url !== null && (
                <a
                  href={venue.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-ink-faint transition-colors duration-150 hover:text-brass"
                  aria-label={`${venue.name} website`}
                >
                  <ExternalLink size={13} aria-hidden />
                </a>
              )}
            </span>
            <Chip tone={STATUS_TONES[venue.status]}>
              {STATUS_LABELS[venue.status]}
            </Chip>
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
                blocker.kind === "capacity_unknown" ||
                blocker.kind === "hire_unknown"
                  ? "text-ink-faint"
                  : "font-medium text-madder"
              }`}
            >
              {blockerText(blocker)}
            </span>
          ))}
          {venue.notes !== null && (
            // Clamped to a line while closed: the notes are the part of this
            // decision no column can hold, so they keep a presence in the
            // table, and the panel below has them whole. No `block` here:
            // line-clamp needs display: -webkit-box, and `block` beats it.
            <span className="mt-1 line-clamp-1 max-w-md text-xs leading-relaxed text-ink-soft">
              {venue.notes}
            </span>
          )}
        </td>

        <td className="px-3 py-3 align-top">
          <SeatsCell fit={fit} />
        </td>

        <td className="px-4 py-3 text-right align-top">
          {cost.hireUnknown && (
            // A total missing its hire fee is a floor, and has to read as
            // one at a glance: "from" is the whole difference between an
            // honest number and a wrong one.
            <span className="mr-1 text-xs text-ink-faint">from</span>
          )}
          <span className="figures font-medium">
            {formatCentsWhole(cost.totalCents)}
          </span>
          <span className="mt-0.5 block text-xs whitespace-nowrap text-ink-faint">
            {cost.hireUnknown
              ? "hire not quoted"
              : `${formatCentsWhole(cost.hireCents)} hire`}{" "}
            + {formatCentsWhole(cost.cateringCents + cost.minimumTopUpCents)}{" "}
            {cost.cateringAssumed ? (
              // Estimated, and marked in brass wherever it appears: the
              // number is comparable, which is the point, but it is ours
              // and not something the venue has ever said.
              <span className="text-brass">catering (est.)</span>
            ) : (
              "catering"
            )}
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

      {open && (
        // Not dimmed when the venue is blocked, unlike the row above it: you
        // opened this to read it, and the reason it is blocked is in here.
        <tr
          id={panelId}
          className="border-b border-hairline/60 bg-brass-tint/10 last:border-0"
        >
          <td colSpan={7} className="px-4 pt-1 pb-6">
            {/* The table is wider than a phone and scrolls sideways, so
                on a narrow screen the panel is capped to roughly the
                viewport: everything worth reading then sits at the left
                edge instead of off past the horizontal scroll. The cap
                belongs here rather than in VenueDetail, which is also
                shown in a dialog that has no such problem. */}
            <div className="max-w-xs sm:max-w-none">
              <VenueDetail evaluation={evaluation} counts={counts} />
            </div>
          </td>
        </tr>
      )}
    </>
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
    case "hire_unknown":
      return "Ask what it costs to hire - the total is the food only";
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
