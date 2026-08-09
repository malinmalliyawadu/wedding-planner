import { asc } from "drizzle-orm";
import { db } from "@/db";
import { households } from "@/db/schema";
import { getSettings } from "@/lib/queries";
import { DeleteButton } from "@/components/delete-button";
import {
  EmptyState,
  PageHeader,
  SideChip,
  StageChip,
} from "@/components/ui";
import { deleteHousehold } from "./actions";
import { HouseholdDialog } from "./household-dialog";

export const dynamic = "force-dynamic";

export default async function HouseholdsPage() {
  const [settings, list] = await Promise.all([
    getSettings(),
    db.query.households.findMany({
      with: { guests: true },
      orderBy: [asc(households.name)],
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="The envelope list"
        title="Households"
        actions={<HouseholdDialog />}
      >
        <p className="mt-3 text-xs text-ink-soft">
          <span className="figures">{list.length}</span> households ·{" "}
          <span className="figures">
            {list.reduce((n, h) => n + h.guests.length, 0)}
          </span>{" "}
          people
        </p>
      </PageHeader>

      {list.length === 0 ? (
        <EmptyState
          title="No households yet"
          hint="Guests are grouped into households - one invitation per household."
          action={<HouseholdDialog />}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {list.map((h) => (
            <li
              key={h.id}
              className="group rounded-lg border border-hairline bg-card p-5 shadow-card transition-colors duration-150 hover:border-hairline-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg leading-snug">
                    {h.name}
                  </h2>
                  {h.address && (
                    <p className="mt-0.5 truncate text-xs text-ink-faint">
                      {h.address}
                    </p>
                  )}
                </div>
                <StageChip stage={h.inviteStage} />
              </div>

              <ul className="mt-3 space-y-1 border-t border-hairline pt-3">
                {h.guests.length === 0 ? (
                  <li className="text-xs text-ink-faint italic">
                    Nobody in this household yet
                  </li>
                ) : (
                  h.guests.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>
                        {g.firstName} {g.lastName}
                        {g.ageBracket !== "adult" && (
                          <span className="ml-1.5 text-xs text-ink-faint capitalize">
                            {g.ageBracket}
                          </span>
                        )}
                      </span>
                      <SideChip
                        side={g.side}
                        nameA={settings.partnerAName}
                        nameB={settings.partnerBName}
                      />
                    </li>
                  ))
                )}
              </ul>

              {h.notes && (
                <p className="mt-3 border-t border-hairline pt-2.5 text-xs text-ink-soft italic">
                  {h.notes}
                </p>
              )}

              <div className="mt-3 flex justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                <HouseholdDialog
                  household={{
                    id: h.id,
                    name: h.name,
                    address: h.address,
                    inviteStage: h.inviteStage,
                    notes: h.notes,
                  }}
                />
                <DeleteButton
                  action={deleteHousehold.bind(null, h.id)}
                  label={`Delete ${h.name}`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
