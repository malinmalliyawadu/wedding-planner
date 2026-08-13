"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  Eraser,
  PinOff,
  Play,
  Save,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui";
import { Slider } from "@/components/slider";
import {
  buildReport,
  DEFAULT_WEIGHTS,
  solveSeating,
  type Assignment,
  type SeatingConstraint,
  type SeatingInput,
  type SeatingTable,
} from "@/lib/seating";
import { clearSeating, saveArrangement } from "./actions";
import { GuestChip, type BoardGuest } from "./guest-chip";

type Props = {
  guests: Array<BoardGuest & { tableId: number | null; pinned: boolean }>;
  tables: SeatingTable[];
  constraints: SeatingConstraint[];
  nameA: string;
  nameB: string;
};

export function SeatingBoard({
  guests,
  tables,
  constraints,
  nameA,
  nameB,
}: Props) {
  const router = useRouter();
  const [seats, setSeats] = useState<Map<number, number | null>>(
    () => new Map(guests.map((g) => [g.id, g.tableId])),
  );
  const [pins, setPins] = useState<Set<number>>(
    () => new Set(guests.filter((g) => g.pinned).map((g) => g.id)),
  );
  const [householdSplit, setHouseholdSplit] = useState(
    DEFAULT_WEIGHTS.householdSplit,
  );
  const [solving, setSolving] = useState(false);
  const [lastRun, setLastRun] = useState<{ ms: number; moved: number } | null>(
    null,
  );
  const [saving, startSaving] = useTransition();
  const [dragOver, setDragOver] = useState<number | "pool" | null>(null);

  const weights = useMemo(
    () => ({ ...DEFAULT_WEIGHTS, householdSplit }),
    [householdSplit],
  );

  const input: SeatingInput = useMemo(
    () => ({
      guests: guests.map((g) => ({
        id: g.id,
        firstName: g.firstName,
        lastName: g.lastName,
        householdId: g.householdId,
        pinned: pins.has(g.id),
        tableId: seats.get(g.id) ?? null,
      })),
      tables,
      constraints,
    }),
    [guests, tables, constraints, seats, pins],
  );

  const assignment: Assignment = useMemo(() => new Map(seats), [seats]);
  const report = useMemo(
    () => buildReport(input, assignment, weights),
    [input, assignment, weights],
  );

  const dirty = useMemo(
    () =>
      guests.some(
        (g) =>
          (seats.get(g.id) ?? null) !== g.tableId || pins.has(g.id) !== g.pinned,
      ),
    [guests, seats, pins],
  );

  const flaggedGuests = useMemo(() => {
    const flagged = new Set<number>();
    for (const v of report.violations) {
      flagged.add(v.constraint.guestAId);
      flagged.add(v.constraint.guestBId);
    }
    return flagged;
  }, [report.violations]);

  function moveGuest(guestId: number, tableId: number | null, pin: boolean) {
    setSeats((prev) => new Map(prev).set(guestId, tableId));
    setPins((prev) => {
      const next = new Set(prev);
      if (pin) next.add(guestId);
      else next.delete(guestId);
      return next;
    });
  }

  function togglePin(guestId: number) {
    setPins((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  }

  function runSolver() {
    setSolving(true);
    // Yield a frame so the button can show it is working before the
    // annealer takes the thread.
    requestAnimationFrame(() => {
      const result = solveSeating(input, { weights, seed: Date.now() & 0xffff });
      setSeats(new Map(result.assignment));
      setLastRun({ ms: result.elapsedMs, moved: result.moved });
      setSolving(false);
    });
  }

  const seatedCount = [...seats.values()].filter((t) => t !== null).length;
  const unseated = guests.filter((g) => (seats.get(g.id) ?? null) === null);
  const totalSeats = tables.reduce((n, t) => n + t.capacity, 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button onClick={runSolver} disabled={solving || tables.length === 0}>
          <Play size={15} aria-hidden />
          {solving ? "Seating…" : "Run the solver"}
        </Button>

        <label className="flex items-center gap-2 text-xs text-ink-soft">
          <span className="whitespace-nowrap">Keep households together</span>
          <span className="w-28">
            <Slider
              value={householdSplit}
              max={10}
              size="sm"
              tone="brass"
              label="Household cohesion weight"
              valueText={
                householdSplit === 0
                  ? "off"
                  : `${householdSplit} out of 10`
              }
              onChange={setHouseholdSplit}
            />
          </span>
          <span className="figures w-4">{householdSplit}</span>
        </label>

        {lastRun && !solving && (
          <span className="text-xs text-ink-faint">
            moved <span className="figures">{lastRun.moved}</span> in{" "}
            <span className="figures">{lastRun.ms}</span>ms
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {pins.size > 0 && (
            <button
              onClick={() => setPins(new Set())}
              className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink"
            >
              <PinOff size={13} aria-hidden />
              Unpin all ({pins.size})
            </button>
          )}
          <button
            onClick={() =>
              startSaving(async () => {
                await clearSeating();
                setSeats(new Map(guests.map((g) => [g.id, null])));
                setPins(new Set());
                router.refresh();
              })
            }
            className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink"
          >
            <Eraser size={13} aria-hidden />
            Clear
          </button>
          <Button
            variant={dirty ? "primary" : "subtle"}
            size="sm"
            disabled={!dirty || saving}
            onClick={() =>
              startSaving(async () => {
                await saveArrangement(
                  guests.map((g) => ({
                    guestId: g.id,
                    tableId: seats.get(g.id) ?? null,
                    pinned: pins.has(g.id),
                  })),
                );
                router.refresh();
              })
            }
          >
            <Save size={14} aria-hidden />
            {saving ? "Saving…" : dirty ? "Save arrangement" : "Saved"}
          </Button>
        </div>
      </div>

      {/* Everything the arrangement gets wrong, said out loud. */}
      <ReportPanel report={report} totalSeats={totalSeats} seated={seatedCount} />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map((table) => {
          const seated = guests.filter((g) => seats.get(g.id) === table.id);
          const over = seated.length > table.capacity;
          return (
            <section
              key={table.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(table.id);
              }}
              onDragLeave={() => setDragOver((d) => (d === table.id ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const guestId = Number(e.dataTransfer.getData("text/plain"));
                if (guestId) moveGuest(guestId, table.id, true);
              }}
              className={`rounded-lg border bg-card p-4 shadow-card transition-colors duration-150 ${
                dragOver === table.id
                  ? "border-brass bg-brass-tint/40"
                  : over
                    ? "border-madder/40"
                    : "border-hairline"
              }`}
            >
              <header className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-base">{table.name}</h2>
                <span
                  className={`figures text-xs ${over ? "font-medium text-madder" : "text-ink-soft"}`}
                >
                  {seated.length}/{table.capacity}
                </span>
              </header>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {Array.from({
                  length: Math.max(table.capacity, seated.length),
                }).map((_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${
                      i < seated.length
                        ? i < table.capacity
                          ? "bg-sage-mid"
                          : "bg-madder"
                        : "border border-hairline-strong"
                    }`}
                  />
                ))}
              </div>

              <div className="mt-3 flex min-h-16 flex-wrap content-start gap-1.5">
                {seated.length === 0 ? (
                  <p className="text-xs text-ink-faint italic">
                    Drop someone here
                  </p>
                ) : (
                  seated.map((g) => (
                    <GuestChip
                      key={g.id}
                      guest={g}
                      tableId={table.id}
                      pinned={pins.has(g.id)}
                      tables={tables}
                      nameA={nameA}
                      nameB={nameB}
                      flagged={flaggedGuests.has(g.id)}
                      onMove={(tableId, pin) => moveGuest(g.id, tableId, pin)}
                      onTogglePin={() => togglePin(g.id)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* The pool: anyone not at a table yet. */}
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver("pool");
        }}
        onDragLeave={() => setDragOver((d) => (d === "pool" ? null : d))}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(null);
          const guestId = Number(e.dataTransfer.getData("text/plain"));
          if (guestId) moveGuest(guestId, null, false);
        }}
        className={`mt-6 rounded-lg border border-dashed p-5 transition-colors duration-150 ${
          dragOver === "pool"
            ? "border-brass bg-brass-tint/40"
            : "border-hairline-strong bg-card/60"
        }`}
      >
        <h2 className="eyebrow flex items-center gap-2 text-brass">
          <Users size={13} aria-hidden />
          Not seated ({unseated.length})
        </h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {unseated.length === 0 ? (
            <p className="text-xs text-ink-faint italic">
              Everyone has a seat.
            </p>
          ) : (
            unseated.map((g) => (
              <GuestChip
                key={g.id}
                guest={g}
                tableId={null}
                pinned={pins.has(g.id)}
                tables={tables}
                nameA={nameA}
                nameB={nameB}
                flagged={flaggedGuests.has(g.id)}
                onMove={(tableId, pin) => moveGuest(g.id, tableId, pin)}
                onTogglePin={() => togglePin(g.id)}
              />
            ))
          )}
        </div>
      </section>
    </>
  );
}

function ReportPanel({
  report,
  totalSeats,
  seated,
}: {
  report: ReturnType<typeof buildReport>;
  totalSeats: number;
  seated: number;
}) {
  const clean =
    report.violations.length === 0 &&
    report.overCapacityTables.length === 0 &&
    report.unseated.length === 0;

  if (clean) {
    return (
      <p className="rounded-lg border border-fern/25 bg-fern-tint px-5 py-3 text-sm text-fern">
        Every rule holds, every table is within capacity, and all{" "}
        <span className="figures">{seated}</span> guests have a seat
        {report.splitHouseholds.length > 0 && (
          <>
            {" "}
            — though{" "}
            <span className="figures">{report.splitHouseholds.length}</span>{" "}
            household
            {report.splitHouseholds.length === 1 ? " is" : "s are"} split across
            tables
          </>
        )}
        .
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-madder/25 bg-madder-tint/60 px-5 py-4">
      <h2 className="eyebrow flex items-center gap-2 text-madder">
        <CircleAlert size={14} aria-hidden />
        What this arrangement gets wrong
      </h2>

      {report.unseated.length > 0 && (
        <p className="text-sm text-madder">
          <span className="figures font-medium">{report.unseated.length}</span>{" "}
          guest{report.unseated.length === 1 ? " has" : "s have"} no seat
          {totalSeats < seated + report.unseated.length && (
            <> — there are only {totalSeats} seats for {seated + report.unseated.length} people</>
          )}
          .
        </p>
      )}

      {report.overCapacityTables.length > 0 && (
        <p className="text-sm text-madder">
          Over capacity:{" "}
          {report.overCapacityTables.map((t, i) => (
            <span key={t.table.id}>
              {i > 0 && ", "}
              <span className="font-medium">{t.table.name}</span> by {t.over}
            </span>
          ))}
          .
        </p>
      )}

      {report.violations.length > 0 && (
        <ul className="space-y-1.5">
          {report.violations.map((v) => (
            <li
              key={v.constraint.id}
              className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink"
            >
              <span
                className={`figures shrink-0 rounded px-1.5 text-xs ${
                  v.constraint.weight >= 8
                    ? "bg-madder text-white"
                    : "bg-madder-tint text-madder"
                }`}
                title={`Strength ${v.constraint.weight} of 10`}
              >
                {v.constraint.weight}
              </span>
              <span>
                <span className="font-medium">{v.guestAName}</span> and{" "}
                <span className="font-medium">{v.guestBName}</span>{" "}
                {v.constraint.kind === "together" ? (
                  <>
                    should sit together, but are on{" "}
                    {v.tableAName ?? "no table"} and{" "}
                    {v.tableBName ?? "no table"}
                  </>
                ) : (
                  <>
                    should be kept apart, but are both on{" "}
                    {v.tableAName ?? "no table"}
                  </>
                )}
                .
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
