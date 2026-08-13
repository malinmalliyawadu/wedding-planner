import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { guests, seatingConstraints, tables } from "@/db/schema";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/queries";
import { ConstraintsPanel, type ConstraintRow } from "./constraints-panel";
import { SeatingBoard } from "./seating-board";

export const dynamic = "force-dynamic";

export default async function SeatingPage() {
  const [settings, allGuests, tableRows, constraintRows] = await Promise.all([
    getSettings(),
    db.query.guests.findMany({
      with: { household: true },
      orderBy: [asc(guests.lastName), asc(guests.firstName)],
    }),
    db.select().from(tables).orderBy(asc(tables.name)),
    db.select().from(seatingConstraints).orderBy(asc(seatingConstraints.id)),
  ]);

  // Infants sit on laps, and nobody who has declined needs a chair.
  const seatable = allGuests.filter(
    (g) => g.rsvpStatus === "attending" && g.ageBracket !== "infant",
  );

  const nameById = new Map(
    allGuests.map((g) => [g.id, `${g.firstName} ${g.lastName}`]),
  );

  // Rules naming someone who is not being seated cannot be satisfied or
  // broken, so they are left out of the solver and the panel alike.
  const seatableIds = new Set(seatable.map((g) => g.id));
  const liveConstraints = constraintRows.filter(
    (c) => seatableIds.has(c.guestAId) && seatableIds.has(c.guestBId),
  );

  const constraintRowsForPanel: ConstraintRow[] = liveConstraints.map((c) => ({
    id: c.id,
    guestAId: c.guestAId,
    guestBId: c.guestBId,
    guestAName: nameById.get(c.guestAId) ?? "Unknown",
    guestBName: nameById.get(c.guestBId) ?? "Unknown",
    kind: c.kind,
    weight: c.weight,
  }));

  if (tableRows.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Where everyone sits" title="Seating" />
        <EmptyState
          title="No tables to seat anyone at"
          hint="Set up the tables and their capacities first, then come back and let the solver fill them."
          action={
            <Link
              href="/admin/tables"
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-spine-raised"
            >
              Set up tables
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Where everyone sits" title="Seating">
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          The solver seats everyone who has said yes, minding capacity and the
          rules below. Drag anyone to a table to pin them where they are; the
          solver will work around them. Anything it cannot satisfy is listed
          rather than quietly ignored.
        </p>
      </PageHeader>

      {seatable.length === 0 ? (
        <EmptyState
          title="Nobody has said yes yet"
          hint="Once guests are marked attending they will appear here to be seated."
          action={
            <Link
              href="/admin/guests"
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-spine-raised"
            >
              Open the guest list
            </Link>
          }
        />
      ) : (
        <SeatingBoard
          guests={seatable.map((g) => ({
            id: g.id,
            firstName: g.firstName,
            lastName: g.lastName,
            householdId: g.householdId,
            householdName: g.household.name,
            side: g.side,
            ageBracket: g.ageBracket,
            dietaryNotes: g.dietaryNotes,
            tableId: g.tableId,
            pinned: g.pinned,
          }))}
          tables={tableRows.map((t) => ({
            id: t.id,
            name: t.name,
            capacity: t.capacity,
          }))}
          constraints={liveConstraints.map((c) => ({
            id: c.id,
            guestAId: c.guestAId,
            guestBId: c.guestBId,
            kind: c.kind,
            weight: c.weight,
          }))}
          nameA={settings.partnerAName}
          nameB={settings.partnerBName}
        />
      )}

      <ConstraintsPanel
        constraints={constraintRowsForPanel}
        guests={seatable.map((g) => ({
          id: g.id,
          name: `${g.firstName} ${g.lastName}`,
        }))}
      />
    </>
  );
}
