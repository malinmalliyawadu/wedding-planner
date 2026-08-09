import Link from "next/link";
import { asc } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { budgetItems, contributions, payments } from "@/db/schema";
import { DeleteButton } from "@/components/delete-button";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { formatDateShort, todayNZ } from "@/lib/dates";
import { formatCentsWhole } from "@/lib/money";
import { getSettings } from "@/lib/queries";
import { compareISO } from "@/lib/projection";
import { deleteContribution, deletePayment } from "./actions";
import { ContributionDialog, PaymentDialog } from "./entry-dialogs";
import { PaidToggle } from "./paid-toggle";
import { SavingsClient } from "./savings-client";

export const dynamic = "force-dynamic";

export default async function SavingsPage() {
  const today = todayNZ();
  const [settings, contributionRows, paymentRows, items] = await Promise.all([
    getSettings(),
    db.select().from(contributions).orderBy(asc(contributions.date)),
    db.query.payments.findMany({
      with: { budgetItem: true },
      orderBy: [asc(payments.dueDate)],
    }),
    db
      .select({
        id: budgetItems.id,
        name: budgetItems.name,
        category: budgetItems.category,
      })
      .from(budgetItems)
      .orderBy(asc(budgetItems.category), asc(budgetItems.name)),
  ]);

  const addPayment = (
    <PaymentDialog
      budgetItems={items}
      today={today}
      trigger={
        <Button variant="subtle" size="sm">
          <Plus size={14} aria-hidden />
          Schedule a payment
        </Button>
      }
    />
  );

  if (settings.weddingDate === null) {
    return (
      <>
        <PageHeader eyebrow="Getting there" title="Savings" />
        <EmptyState
          title="Set the wedding date first"
          hint="The projection runs from today to the wedding day, so it needs a date to run to."
          action={
            <Link
              href="/settings"
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-spine-raised"
            >
              Open settings
            </Link>
          }
        />
      </>
    );
  }

  const upcoming = paymentRows.filter((p) => p.paidDate === null);
  const settled = paymentRows.filter((p) => p.paidDate !== null);

  return (
    <>
      <PageHeader eyebrow="Getting there" title="Savings">
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          Money in against money out, projected from today to{" "}
          {formatDateShort(settings.weddingDate)}. What matters is not the
          total saved but whether the balance holds up on every day a payment
          falls due.
        </p>
      </PageHeader>

      <SavingsClient
        today={today}
        weddingDate={settings.weddingDate}
        contributions={contributionRows.map((c) => ({
          date: c.date,
          amountCents: c.amountCents,
          source: c.source,
        }))}
        payments={paymentRows.map((p) => ({
          id: p.id,
          label: p.notes ? `${p.budgetItem.name} (${p.notes})` : p.budgetItem.name,
          dueDate: p.dueDate,
          amountCents: p.amountCents,
          paidDate: p.paidDate,
        }))}
        savedMonthlyCents={settings.monthlyContributionCents}
        contributionDayOfMonth={settings.contributionDayOfMonth}
      />

      {/* The two ledgers the projection is built from. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-hairline bg-card shadow-card">
          <header className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <div>
              <h2 className="eyebrow text-brass">Still to pay</h2>
              <p className="figures mt-1 text-lg">
                {formatCentsWhole(
                  upcoming.reduce((sum, p) => sum + p.amountCents, 0),
                )}
              </p>
            </div>
            {addPayment}
          </header>

          {upcoming.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-faint">
              Nothing outstanding.
            </p>
          ) : (
            <ul className="divide-y divide-hairline/60">
              {upcoming.map((p) => {
                const overdue = compareISO(p.dueDate, today) < 0;
                return (
                  <li
                    key={p.id}
                    className="group flex items-center gap-3 px-5 py-2.5"
                  >
                    <PaidToggle
                      id={p.id}
                      paid={false}
                      label={p.budgetItem.name}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {p.budgetItem.name}
                        {p.notes && (
                          <span className="ml-1.5 text-xs font-normal text-ink-faint">
                            {p.notes}
                          </span>
                        )}
                      </p>
                      <p
                        className={`text-xs ${overdue ? "font-medium text-madder" : "text-ink-faint"}`}
                      >
                        {overdue ? "Overdue · " : ""}
                        {formatDateShort(p.dueDate)}
                      </p>
                    </div>
                    <span className="figures text-sm">
                      {formatCentsWhole(p.amountCents)}
                    </span>
                    <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <PaymentDialog
                        payment={{
                          id: p.id,
                          budgetItemId: p.budgetItemId,
                          amountCents: p.amountCents,
                          dueDate: p.dueDate,
                          paidDate: p.paidDate,
                          notes: p.notes,
                        }}
                        budgetItems={items}
                        today={today}
                      />
                      <DeleteButton
                        action={deletePayment.bind(null, p.id)}
                        label={`Delete payment for ${p.budgetItem.name}`}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {settled.length > 0 && (
            <details className="border-t border-hairline">
              <summary className="cursor-pointer px-5 py-3 text-xs text-ink-soft hover:text-ink">
                {settled.length} already paid ·{" "}
                <span className="figures">
                  {formatCentsWhole(
                    settled.reduce((sum, p) => sum + p.amountCents, 0),
                  )}
                </span>
              </summary>
              <ul className="divide-y divide-hairline/60 border-t border-hairline">
                {settled.map((p) => (
                  <li
                    key={p.id}
                    className="group flex items-center gap-3 px-5 py-2.5 text-ink-soft"
                  >
                    <PaidToggle id={p.id} paid label={p.budgetItem.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{p.budgetItem.name}</p>
                      <p className="text-xs text-ink-faint">
                        Paid {formatDateShort(p.paidDate!)}
                      </p>
                    </div>
                    <span className="figures text-sm">
                      {formatCentsWhole(p.amountCents)}
                    </span>
                    <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <PaymentDialog
                        payment={{
                          id: p.id,
                          budgetItemId: p.budgetItemId,
                          amountCents: p.amountCents,
                          dueDate: p.dueDate,
                          paidDate: p.paidDate,
                          notes: p.notes,
                        }}
                        budgetItems={items}
                        today={today}
                      />
                      <DeleteButton
                        action={deletePayment.bind(null, p.id)}
                        label={`Delete payment for ${p.budgetItem.name}`}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="rounded-lg border border-hairline bg-card shadow-card">
          <header className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <div>
              <h2 className="eyebrow text-brass">Put away so far</h2>
              <p className="figures mt-1 text-lg">
                {formatCentsWhole(
                  contributionRows.reduce((sum, c) => sum + c.amountCents, 0),
                )}
              </p>
            </div>
            <ContributionDialog
              today={today}
              trigger={
                <Button variant="subtle" size="sm">
                  <Plus size={14} aria-hidden />
                  Record a contribution
                </Button>
              }
            />
          </header>

          {contributionRows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-faint">
              Nothing recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-hairline/60">
              {[...contributionRows].reverse().map((c) => (
                <li key={c.id} className="group flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.source}</p>
                    <p className="text-xs text-ink-faint">
                      {formatDateShort(c.date)}
                      {c.notes && ` · ${c.notes}`}
                    </p>
                  </div>
                  <span className="figures text-sm text-fern">
                    +{formatCentsWhole(c.amountCents)}
                  </span>
                  <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <ContributionDialog
                      today={today}
                      contribution={{
                        id: c.id,
                        date: c.date,
                        amountCents: c.amountCents,
                        source: c.source,
                        notes: c.notes,
                      }}
                    />
                    <DeleteButton
                      action={deleteContribution.bind(null, c.id)}
                      label={`Delete contribution from ${c.source}`}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
