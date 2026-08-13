import { asc } from "drizzle-orm";
import { db } from "@/db";
import { tables } from "@/db/schema";
import { DeleteButton } from "@/components/delete-button";
import { EmptyState, PageHeader } from "@/components/ui";
import { deleteTable } from "./actions";
import { TableDialog } from "./table-dialog";

export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const list = await db.query.tables.findMany({
    with: { guests: true },
    orderBy: [asc(tables.name)],
  });

  const totalSeats = list.reduce((n, t) => n + t.capacity, 0);
  const totalSeated = list.reduce((n, t) => n + t.guests.length, 0);

  return (
    <>
      <PageHeader
        eyebrow="The floor plan"
        title="Tables"
        actions={<TableDialog />}
      >
        <p className="mt-3 text-xs text-ink-soft">
          <span className="figures">{list.length}</span> tables ·{" "}
          <span className="figures">{totalSeated}</span> of{" "}
          <span className="figures">{totalSeats}</span> seats filled
        </p>
      </PageHeader>

      {list.length === 0 ? (
        <EmptyState
          title="No tables yet"
          hint="Set up your tables here; the seating solver (milestone 4) will fill them."
          action={<TableDialog />}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => {
            const over = t.guests.length > t.capacity;
            return (
              <li
                key={t.id}
                className="group rounded-lg border border-hairline bg-card p-5 shadow-card transition-colors duration-150 hover:border-hairline-strong"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-lg">{t.name}</h2>
                  <p
                    className={`figures text-xs ${over ? "font-medium text-madder" : "text-ink-soft"}`}
                  >
                    {t.guests.length}/{t.capacity}
                  </p>
                </div>

                {/* Seat dots: one per seat, filled when taken. */}
                <div
                  className="mt-3 flex flex-wrap gap-1.5"
                  aria-label={`${t.guests.length} of ${t.capacity} seats filled${over ? ", over capacity" : ""}`}
                >
                  {Array.from({ length: Math.max(t.capacity, t.guests.length) }).map(
                    (_, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className={`h-2 w-2 rounded-full ${
                          i < t.guests.length
                            ? i < t.capacity
                              ? "bg-sage-mid"
                              : "bg-madder"
                            : "border border-hairline-strong"
                        }`}
                      />
                    ),
                  )}
                </div>
                {over && (
                  <p className="mt-2 text-xs font-medium text-madder">
                    Over capacity
                  </p>
                )}

                {t.guests.length > 0 && (
                  <p className="mt-3 border-t border-hairline pt-3 text-xs leading-relaxed text-ink-soft">
                    {t.guests
                      .map((g) => `${g.firstName} ${g.lastName}`)
                      .join(" · ")}
                  </p>
                )}

                <div className="mt-3 flex justify-end gap-0.5 row-actions">
                  <TableDialog
                    table={{ id: t.id, name: t.name, capacity: t.capacity }}
                  />
                  <DeleteButton
                    action={deleteTable.bind(null, t.id)}
                    label={`Delete ${t.name}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
