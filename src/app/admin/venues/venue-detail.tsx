"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formatDateShort } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { formatTime } from "@/lib/run-sheet";
import type { GuestCounts, VenueEvaluation } from "@/lib/venues";
import type { VenueValues } from "./venue-dialog";

/**
 * The whole record for one venue, at a given guest count.
 *
 * Shared by both venue pages: the comparison opens it in a row's
 * disclosure panel, the ranking board in a dialog. One implementation on
 * purpose - two copies of "everything we know about this place" would
 * drift, and the half you were not looking at would be the stale one.
 *
 * The cost section is deliberately the arithmetic rather than a repeat of
 * the total: a per-head quote and a minimum spend are the two things a
 * venue can be misread on, and seeing `96 × $165.00` add up to the number
 * in the table is what makes the number trustworthy. It is set in exact
 * cents here, not whole dollars like the table, because a breakdown whose
 * parts do not visibly sum to its total is worse than no breakdown.
 */
export function VenueDetail({
  evaluation,
  counts,
}: {
  evaluation: VenueEvaluation<VenueValues>;
  counts: GuestCounts;
}) {
  const { venue, cost, fit } = evaluation;
  // True however the rates were arrived at: what it says is that a child
  // costs what an adult costs here, which is the fact worth flagging.
  const childrenAtAdultRate = cost.perChildCents === cost.perAdultCents;

  return (
    // Container queries, not breakpoints: this lays out inside a
    // full-width disclosure row on one page and a capped dialog on the
    // other, so the question is how wide *it* is and never how wide the
    // window is. Against the viewport the dialog would take three
    // columns on a desktop and squeeze `58 × $165.00` into 230px.
    <div className="@container">
      <div className="grid grid-cols-1 gap-x-10 gap-y-6 @2xl:grid-cols-2 @4xl:grid-cols-3">
        <DetailSection title="What it costs">
          <DetailRow label="Hire fee" mono={!cost.hireUnknown}>
            {cost.hireUnknown
              ? notRecorded("Not quoted")
              : formatCents(cost.hireCents)}
          </DetailRow>
          <DetailRow
            label={
              <>
                Adults{" "}
                <span className="figures text-ink-faint">
                  {counts.adults} × {formatCents(cost.perAdultCents)}
                </span>
                {cost.cateringAssumed && (
                  <span className="text-brass"> (assumed)</span>
                )}
              </>
            }
            mono
          >
            {formatCents(cost.adultsCents)}
          </DetailRow>
          <DetailRow
            label={
              <>
                Children{" "}
                <span className="figures text-ink-faint">
                  {counts.children} × {formatCents(cost.perChildCents)}
                </span>
                {childrenAtAdultRate && (
                  <span className="text-ink-faint"> (adult rate)</span>
                )}
                {cost.cateringAssumed && (
                  <span className="text-brass"> (assumed)</span>
                )}
              </>
            }
            mono
          >
            {formatCents(cost.childrenCents)}
          </DetailRow>
          {venue.minimumSpendCents !== null && (
            <DetailRow
              label={
                <>
                  Minimum spend{" "}
                  <span className="figures text-ink-faint">
                    {formatCents(venue.minimumSpendCents)}
                  </span>
                </>
              }
              mono={cost.minimumTopUpCents > 0}
              tone={cost.minimumTopUpCents > 0 ? "text-brass" : "text-ink-faint"}
            >
              {cost.minimumTopUpCents > 0
                ? `+ ${formatCents(cost.minimumTopUpCents)}`
                : "Cleared"}
            </DetailRow>
          )}
          <DetailRow
            label={cost.hireUnknown ? "Total so far" : "Total"}
            mono
            strong
          >
            {formatCents(cost.totalCents)}
          </DetailRow>
          <DetailRow
            label={
              <>
                Per guest{" "}
                <span className="text-ink-faint">
                  over <span className="figures">{fit.seatsNeeded}</span>
                </span>
              </>
            }
            mono
          >
            {formatCents(cost.perGuestCents)}
          </DetailRow>
          {cost.hireUnknown && (
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              Nobody has been quoted a hire fee here, so this is the food
              and nothing else - the room is still to come. Unlike the
              catering there is no rate worth assuming: on this list hire
              fees run from nothing to forty thousand dollars, so the one
              thing that cannot be done honestly is to fill it in.
            </p>
          )}
          {cost.cateringAssumed && (
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              {venue.name} quotes no per-head rate, so the food here is
              costed at the outside caterer&rsquo;s rate from{" "}
              <Link
                href="/admin/settings"
                className="text-brass underline decoration-hairline-strong underline-offset-2 transition-colors duration-150 hover:decoration-brass"
              >
                settings
              </Link>
              . Somebody has to feed everyone either way - leaving it out
              would only make this look cheaper than it is.
            </p>
          )}
          {venue.minimumSpendCents !== null && (
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              {evaluation.breakEvenAdults === null
                ? "There is no per-head rate, so no guest count ever reaches this minimum: it is simply a fee."
                : cost.minimumTopUpCents > 0
                  ? `The minimum stops costing you anything at ${evaluation.breakEvenAdults} adults, with ${counts.children} children.`
                  : `Already clear of the minimum: it would start to bite below ${evaluation.breakEvenAdults} adults.`}
            </p>
          )}
        </DetailSection>

        <DetailSection title="The room">
          <DetailRow label="Seated" mono={venue.seatedCapacity !== null}>
            {venue.seatedCapacity ?? notRecorded()}
          </DetailRow>
          <DetailRow label="Standing" mono={venue.standingCapacity !== null}>
            {venue.standingCapacity ?? notRecorded()}
          </DetailRow>
          <DetailRow label="Chairs you need" mono>
            {fit.seatsNeeded}
          </DetailRow>
          {fit.spareSeats !== null && (
            <DetailRow
              label={fit.spareSeats < 0 ? "Short by" : "Spare"}
              mono
              tone={
                fit.verdict === "over"
                  ? "text-madder"
                  : fit.verdict === "tight"
                    ? "text-brass"
                    : "text-ink"
              }
            >
              {Math.abs(fit.spareSeats)}
            </DetailRow>
          )}
          <DetailRow label="Curfew">
            {venue.curfew === null ? notRecorded() : formatTime(venue.curfew)}
          </DetailRow>
          <DetailRow label="Our date">
            {venue.dateAvailable === true ? (
              <span className="text-fern">Free</span>
            ) : venue.dateAvailable === false ? (
              <span className="font-medium text-madder">Taken</span>
            ) : (
              notRecorded("Not asked yet")
            )}
          </DetailRow>
        </DetailSection>

        <DetailSection title="Getting there">
          <DetailRow label="Town">{venue.locality ?? notRecorded()}</DetailRow>
          <DetailRow label="Address">
            {venue.address ?? notRecorded()}
          </DetailRow>
          <DetailRow label="Travel" mono={venue.travelMinutes !== null}>
            {venue.travelMinutes === null
              ? notRecorded()
              : `${venue.travelMinutes} min`}
          </DetailRow>
          <DetailRow label="Website">
            {venue.url === null ? (
              notRecorded()
            ) : (
              <a
                href={venue.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-brass underline decoration-hairline-strong underline-offset-2 transition-colors duration-150 hover:decoration-brass"
              >
                Open
                <ExternalLink size={11} aria-hidden />
              </a>
            )}
          </DetailRow>
          <DetailRow label="Site visit">
            {venue.siteVisitDate === null
              ? notRecorded("Not been yet")
              : formatDateShort(venue.siteVisitDate)}
          </DetailRow>
        </DetailSection>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-6 border-t border-hairline pt-5 @2xl:grid-cols-2">
        <div>
          <h4 className="eyebrow text-brass">What the hire fee includes</h4>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            {venue.hireIncludes ?? (
              <span className="text-ink-faint">
                Not recorded - worth asking, because it decides what else you
                have to hire.
              </span>
            )}
          </p>
        </div>
        <div>
          <h4 className="eyebrow text-brass">Notes</h4>
          <p className="mt-2 text-xs leading-relaxed whitespace-pre-line text-ink-soft">
            {venue.notes ?? (
              <span className="text-ink-faint">
                Nothing written down yet - and this is the part no column here
                can settle.
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h4 className="eyebrow text-brass">{title}</h4>
      <dl className="mt-1.5">{children}</dl>
    </section>
  );
}

function DetailRow({
  label,
  children,
  mono = false,
  strong = false,
  tone = "text-ink",
}: {
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-1 text-xs ${
        strong
          ? "mt-0.5 border-t border-hairline-strong pt-1.5 font-medium"
          : "border-b border-hairline/60 last:border-0"
      }`}
    >
      <dt className="text-ink-faint">{label}</dt>
      <dd className={`text-right ${mono ? "figures" : ""} ${tone}`}>
        {children}
      </dd>
    </div>
  );
}

/** A field nobody has filled in yet, which is a gap in the record and not a fault. */
function notRecorded(text = "Not recorded"): ReactNode {
  return <span className="text-ink-faint">{text}</span>;
}
