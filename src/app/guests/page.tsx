import { asc } from "drizzle-orm";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { db } from "@/db";
import { guests, households, tables } from "@/db/schema";
import { getSettings } from "@/lib/queries";
import { DeleteButton } from "@/components/delete-button";
import { EmptyState, PageHeader, RsvpChip, SideChip } from "@/components/ui";
import { deleteGuest } from "./actions";
import { GuestFilters } from "./filters";
import { GuestDialog } from "./guest-dialog";

export const dynamic = "force-dynamic";

export default async function GuestsPage({
  searchParams,
}: PageProps<"/guests">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.toLowerCase() : "";
  const side = typeof params.side === "string" ? params.side : "";
  const rsvp = typeof params.rsvp === "string" ? params.rsvp : "";
  const age = typeof params.age === "string" ? params.age : "";

  const [settings, allGuests, householdList, tableList] = await Promise.all([
    getSettings(),
    db.query.guests.findMany({
      with: { household: true, table: true },
      orderBy: [asc(guests.lastName), asc(guests.firstName)],
    }),
    db.select().from(households).orderBy(asc(households.name)),
    db.select().from(tables).orderBy(asc(tables.name)),
  ]);

  const filtered = allGuests.filter((g) => {
    if (q && !`${g.firstName} ${g.lastName}`.toLowerCase().includes(q))
      return false;
    if (side && g.side !== side) return false;
    if (rsvp && g.rsvpStatus !== rsvp) return false;
    if (age && g.ageBracket !== age) return false;
    return true;
  });

  const attending = allGuests.filter((g) => g.rsvpStatus === "attending").length;
  const isFiltered = Boolean(q || side || rsvp || age);

  const householdOptions = householdList.map((h) => ({ id: h.id, name: h.name }));
  const tableOptions = tableList.map((t) => ({ id: t.id, name: t.name }));

  return (
    <>
      <PageHeader
        eyebrow="The guest list"
        title="Guests"
        actions={
          <>
            <Link
              href="/guests/import"
              className="inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-card px-4 py-2 text-sm font-medium transition-colors duration-150 hover:border-ink-faint hover:bg-white"
            >
              <FileUp size={15} aria-hidden />
              Import CSV
            </Link>
            <GuestDialog
              households={householdOptions}
              tables={tableOptions}
              nameA={settings.partnerAName}
              nameB={settings.partnerBName}
            />
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <GuestFilters
            nameA={settings.partnerAName}
            nameB={settings.partnerBName}
          />
          <p className="text-xs text-ink-soft">
            <span className="figures">{filtered.length}</span>
            {isFiltered && (
              <>
                {" "}
                of <span className="figures">{allGuests.length}</span>
              </>
            )}{" "}
            guests · <span className="figures">{attending}</span> attending
          </p>
        </div>
      </PageHeader>

      {filtered.length === 0 ? (
        <EmptyState
          title={isFiltered ? "No guests match" : "No guests yet"}
          hint={
            isFiltered
              ? "Try clearing a filter or two."
              : "Add your first guest, or import the list from a spreadsheet."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-hairline bg-card shadow-card">
          <table className="w-full min-w-4xl text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                  Name
                </th>
                <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                  Household
                </th>
                <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                  Side
                </th>
                <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                  RSVP
                </th>
                <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                  Dietary
                </th>
                <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                  Table
                </th>
                <th className="px-2 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr
                  key={g.id}
                  className="group border-b border-hairline/60 transition-colors duration-150 last:border-0 hover:bg-brass-tint/25"
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium">
                      {g.firstName} {g.lastName}
                    </span>
                    {g.ageBracket !== "adult" && (
                      <span className="ml-2 text-xs text-ink-faint capitalize">
                        {g.ageBracket}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {g.household.name}
                  </td>
                  <td className="px-4 py-2.5">
                    <SideChip
                      side={g.side}
                      nameA={settings.partnerAName}
                      nameB={settings.partnerBName}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <RsvpChip status={g.rsvpStatus} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-soft italic">
                    {g.dietaryNotes ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-soft">
                    {g.table?.name ?? "—"}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center justify-end gap-0.5 row-actions">
                      <GuestDialog
                        households={householdOptions}
                        tables={tableOptions}
                        nameA={settings.partnerAName}
                        nameB={settings.partnerBName}
                        guest={{
                          id: g.id,
                          firstName: g.firstName,
                          lastName: g.lastName,
                          householdId: g.householdId,
                          side: g.side,
                          ageBracket: g.ageBracket,
                          dietaryNotes: g.dietaryNotes,
                          rsvpStatus: g.rsvpStatus,
                          tableId: g.tableId,
                        }}
                      />
                      <DeleteButton
                        action={deleteGuest.bind(null, g.id)}
                        label={`Delete ${g.firstName} ${g.lastName}`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
