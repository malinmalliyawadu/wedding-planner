"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Info, Scale, Undo2 } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { Chip, IconButton } from "@/components/ui";
import { useRemembered } from "@/lib/use-remembered";
import { formatCentsWhole } from "@/lib/money";
import {
  evaluateVenues,
  type CateringAssumption,
  type GuestCounts,
  type VenueEvaluation,
} from "@/lib/venues";
import {
  MIN_COMPARISONS_PER_VENUE,
  nextPair,
  orderPair,
  pairKey,
  rankVenues,
  type Comparison,
  type Ranking,
  type Judge,
  type RankedVenue,
} from "@/lib/venue-ranking";
import { STATUS_LABELS, STATUS_TONES } from "../status";
import { VenueDetail } from "../venue-detail";
import type { VenueValues } from "../venue-dialog";
import { recordComparison, undoComparison } from "./actions";

/** One answer, with whatever it replaced, so undo can put that back. */
type HistoryEntry = {
  leftId: number;
  rightId: number;
  judge: Judge;
  replaced: Comparison | null;
};

export function RankingBoard({
  venues,
  initialComparisons,
  counts,
  catering,
  nameA,
  nameB,
}: {
  venues: VenueValues[];
  initialComparisons: Comparison[];
  counts: GuestCounts;
  catering: CateringAssumption;
  nameA: string;
  nameB: string;
}) {
  // The answers live here rather than being refetched, so a tap lands in
  // the same frame it was made in. Over a few hundred of them the
  // difference between that and a round trip is the difference between
  // ranking the list and giving up halfway.
  const [comparisons, setComparisons] = useState(initialComparisons);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [storedJudge, setStoredJudge] = useRemembered("venue-rank-judge");
  const judge: Judge = storedJudge === "b" ? "b" : "a";

  const ranking = useMemo(
    () => rankVenues(venues, comparisons),
    [venues, comparisons],
  );

  // The fit is already done, so nextPair is handed the strengths rather
  // than repeating it - it is the dearer half of the work on this page.
  const strengths = useMemo(
    () => new Map(ranking.ranked.map((entry) => [entry.venue.id, entry.strength])),
    [ranking],
  );

  const pair = useMemo(
    () => nextPair(venues, comparisons, judge, strengths),
    [venues, comparisons, judge, strengths],
  );

  const costs = useMemo(() => {
    const comparison = evaluateVenues(venues, counts, catering);
    return new Map(
      comparison.evaluations.map((e) => [e.venue.id, e] as const),
    );
  }, [venues, counts, catering]);

  const answer = useCallback(
    (winnerId: number | null) => {
      if (pair === null) return;
      const { left, right } = pair;
      const key = pairKey(left.id, right.id);
      const replaced =
        comparisons.find(
          (c) => c.judge === judge && pairKey(c.venueAId, c.venueBId) === key,
        ) ?? null;

      const [venueAId, venueBId] = orderPair(left.id, right.id);
      const verdict: Comparison = { venueAId, venueBId, winnerId, judge };

      setComparisons((current) => withVerdict(current, key, judge, verdict));
      setHistory((current) => [
        ...current,
        { leftId: left.id, rightId: right.id, judge, replaced },
      ]);
      setError(null);

      startTransition(async () => {
        const result = await recordComparison({
          leftId: left.id,
          rightId: right.id,
          winnerId,
          judge,
        });
        if (result.status === "error") {
          // Put the board back to what the database actually holds, so
          // the ranking never quietly rests on an answer that was lost.
          setComparisons((current) => withVerdict(current, key, judge, replaced));
          setHistory((current) => current.slice(0, -1));
          setError(result.message ?? "That answer did not save.");
        }
      });
    },
    [pair, comparisons, judge],
  );

  const undo = useCallback(() => {
    const last = history.at(-1);
    if (last === undefined) return;
    const key = pairKey(last.leftId, last.rightId);

    setComparisons((current) =>
      withVerdict(current, key, last.judge, last.replaced),
    );
    setHistory((current) => current.slice(0, -1));
    setError(null);

    startTransition(async () => {
      const result =
        last.replaced === null
          ? await undoComparison({
              leftId: last.leftId,
              rightId: last.rightId,
              judge: last.judge,
            })
          : await recordComparison({
              leftId: last.leftId,
              rightId: last.rightId,
              winnerId: last.replaced.winnerId,
              judge: last.judge,
            });
      if (result.status === "error") {
        setError(result.message ?? "That could not be undone.");
      }
    });
  }, [history]);

  // Hundreds of answers is a keyboard job on a laptop, so the arrows do
  // what your eyes are already doing. Typing anywhere real is left alone,
  // and space is deliberately not bound: it would fire twice on a button
  // that happens to have focus.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Reading a venue's record is not answering about it. Without this
      // an arrow key while the dialog is open would answer the pair and
      // swap the venue out from under what you were reading. Escape
      // still closes, because that is the dialog's own handler.
      if (document.querySelector("dialog[open]") !== null) return;
      const target = event.target as HTMLElement | null;
      if (
        target !== null &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      if (event.key === "ArrowLeft" && pair !== null) {
        event.preventDefault();
        answer(pair.left.id);
      } else if (event.key === "ArrowRight" && pair !== null) {
        event.preventDefault();
        answer(pair.right.id);
      } else if ((event.key === "=" || event.key === "t") && pair !== null) {
        event.preventDefault();
        answer(null);
      } else if (event.key === "u") {
        event.preventDefault();
        undo();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pair, answer, undo]);

  const judgedByYou = comparisons.filter((c) => c.judge === judge).length;

  return (
    <>
      <ProgressCard
        ranking={ranking}
        total={venues.length}
        judge={judge}
        judgedByYou={judgedByYou}
        nameA={nameA}
        nameB={nameB}
        onJudgeChange={setStoredJudge}
      />

      {error !== null && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-madder/30 bg-madder-tint px-4 py-2.5 text-sm text-madder"
        >
          {error}
        </p>
      )}

      {pair === null ? (
        <section className="mt-6 rounded-lg border border-dashed border-hairline-strong bg-card/60 px-8 py-14 text-center">
          <p className="font-display text-lg text-ink-soft">
            You have answered every pair there is
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-faint">
            There is nothing left to ask you. The order below is as settled as
            your answers can make it.
          </p>
        </section>
      ) : (
        <section
          aria-labelledby="head-to-head"
          className="mt-6 rounded-lg border border-hairline bg-card p-5 shadow-card sm:p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="head-to-head" className="eyebrow text-brass">
              Which would you rather get married at?
            </h2>
            <p className="text-xs text-ink-faint">
              No wrong answer - go on the feeling, not the arithmetic.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChoiceCard
              venue={pair.left}
              evaluation={costs.get(pair.left.id)}
              counts={counts}
              hint="←"
              onChoose={() => answer(pair.left.id)}
            />
            <ChoiceCard
              venue={pair.right}
              evaluation={costs.get(pair.right.id)}
              counts={counts}
              hint="→"
              onChoose={() => answer(pair.right.id)}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
            <button
              type="button"
              onClick={() => answer(null)}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-ink-soft transition-colors duration-150 hover:bg-brass-tint/50 hover:text-ink pointer-coarse:min-h-11 pointer-coarse:text-sm"
            >
              <Scale size={14} aria-hidden />
              Can&rsquo;t split them
            </button>

            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="hidden text-xs text-ink-faint sm:inline"
              >
                ← → to pick · = to tie · u to undo
              </span>
              <button
                type="button"
                onClick={undo}
                disabled={history.length === 0}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-ink-soft transition-colors duration-150 hover:bg-brass-tint/50 hover:text-ink disabled:pointer-events-none disabled:opacity-40 pointer-coarse:min-h-11 pointer-coarse:text-sm"
              >
                <Undo2 size={14} aria-hidden />
                Undo
              </button>
            </div>
          </div>
        </section>
      )}

      <Caveats ranking={ranking} venues={venues} />
      <Contested ranking={ranking} venues={venues} nameA={nameA} nameB={nameB} />
      <RankedTable ranking={ranking} costs={costs} />

      <p className="mt-3 text-xs text-ink-soft">
        Priced at <span className="figures">{counts.adults}</span> adults and{" "}
        <span className="figures">{counts.children}</span> children, to put your
        order next to what it costs - move those on the{" "}
        <span className="text-ink">Compare</span> tab. Ranking is the half of
        this decision no column settles, so nothing here feeds back into a
        total.
      </p>
    </>
  );
}

/** Replace this judge's verdict on one pair, or drop it when null. */
function withVerdict(
  comparisons: Comparison[],
  key: string,
  judge: Judge,
  verdict: Comparison | null,
): Comparison[] {
  const without = comparisons.filter(
    (c) => !(c.judge === judge && pairKey(c.venueAId, c.venueBId) === key),
  );
  return verdict === null ? without : [...without, verdict];
}

function ProgressCard({
  ranking,
  total,
  judge,
  judgedByYou,
  nameA,
  nameB,
  onJudgeChange,
}: {
  ranking: Ranking<VenueValues>;
  total: number;
  judge: Judge;
  judgedByYou: number;
  nameA: string;
  nameB: string;
  onJudgeChange: (judge: Judge) => void;
}) {
  const progress = Math.min(
    1,
    ranking.comparisonsMade / Math.max(ranking.targetComparisons, 1),
  );

  return (
    <section className="rounded-lg border border-hairline bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow text-brass">Answered between you</p>
          <p className="figures mt-1 text-5xl leading-none tabular-nums">
            {ranking.comparisonsMade}
            <span className="ml-2 text-lg text-ink-faint">
              of {ranking.targetComparisons}
            </span>
          </p>
        </div>
        <dl className="flex gap-8 text-right">
          <div>
            <dd className="figures text-lg">
              {ranking.venuesCompared}/{total}
            </dd>
            <dt className="eyebrow mt-0.5 text-ink-faint">Venues reached</dt>
          </div>
          <div>
            <dd className="figures text-lg">
              {ranking.venuesSettled}/{total}
            </dd>
            <dt className="eyebrow mt-0.5 text-ink-faint">Settled</dt>
          </div>
        </dl>
      </div>

      {/* The target is a rule of thumb, so the bar is a hairline that
          fills rather than anything that looks like a deadline. */}
      <div
        className="mt-4 h-1 w-full overflow-hidden rounded-full bg-hairline"
        role="presentation"
      >
        <div
          className="h-full rounded-full bg-brass transition-[width] duration-300"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <p className="mt-3 max-w-2xl text-xs text-ink-soft">
        {ranking.comparisonsMade === 0 ? (
          <>
            Nothing answered yet. The order below is every venue level on
            nothing at all - it starts meaning something from the first tap,
            and the questions are chosen so the early ones count for the most.
          </>
        ) : (
          <>
            The target is{" "}
            <span className="figures text-ink">{MIN_COMPARISONS_PER_VENUE}</span>{" "}
            answers a venue, which is where a position stops swinging on any
            one of them. It is a rule of thumb and not a finish line - the
            order is worth reading long before, and the venues still short of
            it say so.
          </>
        )}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
        <span className="text-xs font-semibold tracking-wide text-ink-soft">
          Answering as
        </span>
        <div className="flex gap-1">
          <JudgeButton
            judge="a"
            active={judge === "a"}
            name={nameA}
            onSelect={onJudgeChange}
          />
          <JudgeButton
            judge="b"
            active={judge === "b"}
            name={nameB}
            onSelect={onJudgeChange}
          />
        </div>
        <span className="text-xs text-ink-faint">
          <span className="figures">{judgedByYou}</span> from you · you are both
          asked about the same pairs, and where you differ is below
        </span>
      </div>
    </section>
  );
}

function JudgeButton({
  judge,
  active,
  name,
  onSelect,
}: {
  judge: Judge;
  active: boolean;
  name: string;
  onSelect: (judge: Judge) => void;
}) {
  const tone =
    judge === "a"
      ? "bg-sage-tint text-sage border-sage-mid"
      : "bg-rose-tint text-rose border-rose-mid";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(judge)}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors duration-150 pointer-coarse:min-h-11 pointer-coarse:text-sm ${
        active
          ? tone
          : "border-hairline-strong bg-transparent text-ink-soft hover:border-ink-faint hover:text-ink"
      }`}
    >
      {name}
    </button>
  );
}

/**
 * One of the two venues on offer.
 *
 * The facts are here but deliberately quiet: what it costs and whether
 * everyone fits is settled on the other tab, and this question is the one
 * those columns cannot answer. They earn their place because choosing
 * between two places you cannot picture is not a preference either.
 */
function ChoiceCard({
  venue,
  evaluation,
  counts,
  hint,
  onChoose,
}: {
  venue: VenueValues;
  evaluation: VenueEvaluation<VenueValues> | undefined;
  counts: GuestCounts;
  hint: string;
  onChoose: () => void;
}) {
  const [showRecord, setShowRecord] = useState(false);
  const detail = [
    venue.locality,
    venue.travelMinutes !== null ? `${venue.travelMinutes} min away` : null,
  ].filter((s): s is string => s !== null);

  return (
    // A div, not a button, because it holds one: the card is picked by
    // the stretched button below, which lets the whole surface be a tap
    // target while leaving room for a second, real button inside it.
    // Nested buttons are invalid and the inner one stops working.
    <div className="group relative flex flex-col rounded-lg border border-hairline-strong bg-paper/60 p-4 text-left transition-colors duration-150 hover:border-brass hover:bg-brass-tint/30 has-[button:focus-visible]:border-brass has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-brass sm:p-5">
      <div className="flex items-start justify-between gap-3">
        {/* Two lines' worth whether or not the name needs them, so the
            facts under a one-line name line up with the facts under a
            two-line one. Side by side, a half-line stagger between the
            two cards reads as one of them being different. */}
        <h3 className="font-display text-lg leading-snug text-balance sm:min-h-[2lh]">
          {venue.name}
        </h3>
        {/* z-20: above the stretched button, or the whole record could
            not be opened - the tap would land on "choose" instead. */}
        <div className="relative z-20 flex shrink-0 items-center gap-1">
          <IconButton
            label={`The whole record for ${venue.name}`}
            onClick={() => setShowRecord(true)}
          >
            <Info size={15} aria-hidden />
          </IconButton>
          {/* The arrow names the key that picks this card, so it goes
              with the rest of the keyboard legend on a screen that has
              no keyboard - on a stacked phone layout a left arrow above
              a right arrow reads as directions, not as shortcuts. */}
          <span
            aria-hidden
            className="figures hidden text-sm text-ink-faint transition-colors duration-150 group-hover:text-brass sm:inline"
          >
            {hint}
          </span>
        </div>
      </div>

      {detail.length > 0 && (
        <p className="mt-1 text-xs text-ink-faint">{detail.join(" · ")}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Chip tone={STATUS_TONES[venue.status]}>
          {STATUS_LABELS[venue.status]}
        </Chip>
        {venue.seatedCapacity !== null && (
          <span className="text-xs text-ink-soft">
            <span className="figures">{venue.seatedCapacity}</span> seated
          </span>
        )}
        {evaluation !== undefined && (
          <span className="text-xs text-ink-soft">
            {evaluation.cost.hireUnknown && (
              <span className="text-ink-faint">from </span>
            )}
            <span
              className={`figures ${
                evaluation.cost.cateringAssumed ? "text-brass" : ""
              }`}
            >
              {formatCentsWhole(evaluation.cost.totalCents)}
            </span>
          </span>
        )}
      </div>

      {venue.notes !== null && (
        // `mt-auto` sits the notes on the floor of the card rather than
        // under whatever happens to be above them, so the two cards
        // agree even when one venue has a town recorded and the other
        // does not. The cards are grid items and already equal height.
        <p className="mt-auto line-clamp-3 pt-3 text-xs leading-relaxed text-ink-soft">
          {venue.notes}
        </p>
      )}

      {/* Last in the DOM and stretched over the card, so a tap anywhere
          that is not the record button picks this venue. It sits above
          the text rather than under it - text is not interactive, and a
          button underneath would never receive the click. */}
      <button
        type="button"
        onClick={onChoose}
        className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none"
      >
        <span className="sr-only">Choose {venue.name}</span>
      </button>

      <Dialog
        open={showRecord}
        onClose={() => setShowRecord(false)}
        title={venue.name}
        size="lg"
      >
        {evaluation === undefined ? (
          <p className="text-sm text-ink-faint">Nothing recorded yet.</p>
        ) : (
          <VenueDetail evaluation={evaluation} counts={counts} />
        )}
      </Dialog>
    </div>
  );
}

/**
 * Where the ranking is not yet a ranking.
 *
 * Both of these are invisible failures otherwise - the fit puts out a
 * confident-looking column either way - which is the same reason
 * `venues.ts` blocks on a capacity nobody has asked for.
 */
function Caveats({
  ranking,
  venues,
}: {
  ranking: Ranking<VenueValues>;
  venues: VenueValues[];
}) {
  const uncompared = ranking.ranked.filter((entry) => entry.uncompared).length;
  const split = ranking.islands.length > 1;
  if (uncompared === 0 && !split) return null;

  const nameOf = new Map(venues.map((v) => [v.id, v.name] as const));

  return (
    <section className="mt-6 rounded-lg border border-hairline bg-card p-5 shadow-card sm:p-6">
      <h2 className="eyebrow text-brass">What this order cannot tell you yet</h2>

      {split && (
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-ink-soft">
          Your answers make{" "}
          <span className="figures text-ink">{ranking.islands.length}</span>{" "}
          separate groups that have never been compared with each other -
          {ranking.islands.map((group, index) => (
            <span key={index}>
              {index > 0 ? "," : ""} {group.length} venue
              {group.length === 1 ? "" : "s"}
            </span>
          ))}
          . Inside a group the order is yours; between groups it is nothing but
          the starting assumption, because no answer of yours connects them.
          Keep going and the questions will join them up - that is what they
          are chosen for.
        </p>
      )}

      {uncompared > 0 && (
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-ink-soft">
          <span className="figures text-ink">{uncompared}</span> venue
          {uncompared === 1 ? " has" : "s have"} not been in a single
          comparison, so {uncompared === 1 ? "it sits" : "they sit"} in the
          middle of the table on the starting assumption rather than on
          anything you have said
          {uncompared <= 4 && (
            <>
              :{" "}
              {ranking.ranked
                .filter((entry) => entry.uncompared)
                .map((entry) => nameOf.get(entry.venue.id) ?? entry.venue.name)
                .join(", ")}
            </>
          )}
          .
        </p>
      )}
    </section>
  );
}

/** The pairs you flatly disagree about, which is the useful argument. */
function Contested({
  ranking,
  venues,
  nameA,
  nameB,
}: {
  ranking: Ranking<VenueValues>;
  venues: VenueValues[];
  nameA: string;
  nameB: string;
}) {
  if (ranking.contested.length === 0) return null;
  const nameOf = new Map(venues.map((v) => [v.id, v.name] as const));

  return (
    <section className="mt-6 rounded-lg border border-hairline bg-card p-5 shadow-card sm:p-6">
      <h2 className="eyebrow text-brass">
        Where you disagree
        <span className="figures ml-2 text-ink-faint">
          {ranking.contested.length}
        </span>
      </h2>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-soft">
        Pairs you picked opposite winners of. One of you having a view where the
        other could not split them is not counted - these are the straight
        contradictions, and they are worth ten minutes of talking each.
      </p>

      <ul className="mt-4 divide-y divide-hairline/60">
        {ranking.contested.map((pair) => (
          <li
            key={`${pair.venueAId}:${pair.venueBId}`}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-xs"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-sage-mid" aria-hidden />
              <span className="text-ink-faint">{nameA}</span>
              <span className="font-medium text-ink">
                {nameOf.get(pair.pickedByA)}
              </span>
            </span>
            <span className="text-ink-faint">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-mid" aria-hidden />
              <span className="text-ink-faint">{nameB}</span>
              <span className="font-medium text-ink">
                {nameOf.get(pair.pickedByB)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RankedTable({
  ranking,
  costs,
}: {
  ranking: Ranking<VenueValues>;
  costs: Map<number, VenueEvaluation<VenueValues>>;
}) {
  return (
    <>
      <div className="mt-6 overflow-x-auto rounded-lg border border-hairline bg-card shadow-card">
        <table className="w-full min-w-2xl text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="eyebrow px-4 py-3 text-right font-semibold text-ink-faint">
                <span className="sr-only">Rank</span>#
              </th>
              <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                Venue
              </th>
              <th className="eyebrow px-3 py-3 font-semibold text-ink-faint">
                Preferred
              </th>
              <th className="eyebrow px-3 py-3 text-right font-semibold text-ink-faint">
                Record
              </th>
              <th className="eyebrow px-4 py-3 text-right font-semibold text-ink-faint">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {ranking.ranked.map((entry) => (
              <RankRow
                key={entry.venue.id}
                entry={entry}
                evaluation={costs.get(entry.venue.id)}
                split={ranking.islands.length > 1}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RankRow({
  entry,
  evaluation,
  split,
}: {
  entry: RankedVenue<VenueValues>;
  evaluation: VenueEvaluation<VenueValues> | undefined;
  split: boolean;
}) {
  const { venue } = entry;
  const percent = Math.round(entry.chanceOverMiddling * 100);

  return (
    <tr
      className={`border-b border-hairline/60 transition-colors duration-150 last:border-0 hover:bg-brass-tint/25 ${
        entry.uncompared ? "opacity-45" : ""
      }`}
    >
      <td className="figures px-4 py-3 text-right align-top text-ink-faint">
        {entry.rank ?? "—"}
      </td>

      <td className="px-4 py-3 align-top">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{venue.name}</span>
          <Chip tone={STATUS_TONES[venue.status]}>
            {STATUS_LABELS[venue.status]}
          </Chip>
        </div>
        {venue.locality !== null && (
          <span className="mt-0.5 block text-xs text-ink-faint">
            {venue.locality}
          </span>
        )}
        {entry.uncompared ? (
          <span className="mt-1 block text-xs text-ink-faint">
            Never compared - this place in the table is the starting
            assumption, not your opinion
          </span>
        ) : (
          <>
            {entry.provisional && (
              <span className="mt-1 block text-xs text-ink-faint">
                Provisional on{" "}
                <span className="figures">{entry.comparisons}</span> of{" "}
                {MIN_COMPARISONS_PER_VENUE} answers
              </span>
            )}
            {split && entry.island !== null && entry.island > 0 && (
              // Only worth saying when there is more than one group: a
              // venue in the second island is not ranked against the
              // first at all, however confident the row looks.
              <span className="mt-1 block text-xs text-brass">
                In a separate group - not yet ranked against the main list
              </span>
            )}
          </>
        )}
      </td>

      <td className="px-3 py-3 align-top">
        {entry.uncompared ? (
          <span className="text-xs text-ink-faint">—</span>
        ) : (
          <div className="flex items-center gap-2">
            {/* Position against the same track for every row is the
                encoding; the number beside it is the exact figure. */}
            <span
              aria-hidden
              className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-hairline"
            >
              <span
                className="block h-full rounded-full bg-brass"
                style={{ width: `${percent}%` }}
              />
            </span>
            <span className="figures text-xs text-ink-soft">{percent}%</span>
          </div>
        )}
      </td>

      <td className="figures px-3 py-3 text-right align-top text-xs whitespace-nowrap text-ink-soft">
        {entry.uncompared ? (
          <span className="text-ink-faint">—</span>
        ) : (
          `${entry.wins}−${entry.losses}${entry.ties > 0 ? `−${entry.ties}` : ""}`
        )}
      </td>

      <td className="px-4 py-3 text-right align-top">
        {evaluation === undefined ? (
          <span className="text-xs text-ink-faint">—</span>
        ) : (
          <>
            {evaluation.cost.hireUnknown && (
              <span className="mr-1 text-xs text-ink-faint">from</span>
            )}
            <span
              className={`figures ${
                evaluation.cost.cateringAssumed ? "text-brass" : ""
              }`}
            >
              {formatCentsWhole(evaluation.cost.totalCents)}
            </span>
          </>
        )}
      </td>
    </tr>
  );
}
