import Link from "next/link";
import { db } from "@/db";
import { getSettings } from "@/lib/queries";
import { daysUntilNZ, formatDateLong } from "@/lib/dates";
import { Duogram } from "@/components/duogram";

export const dynamic = "force-dynamic";

const STAGE_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  invited: "Invited",
  save_the_date: "Save the date",
  not_invited: "Not invited",
};

function CornerMark({ position }: { position: string }) {
  return (
    <span
      aria-hidden
      className={`absolute h-5 w-5 border-brass-bright/70 ${position}`}
    />
  );
}

export default async function OverviewPage() {
  const [settings, allGuests, allHouseholds, allTables] = await Promise.all([
    getSettings(),
    db.query.guests.findMany(),
    db.query.households.findMany(),
    db.query.tables.findMany({ with: { guests: true } }),
  ]);

  const attending = allGuests.filter((g) => g.rsvpStatus === "attending");
  const pending = allGuests.filter((g) => g.rsvpStatus === "pending").length;
  const declined = allGuests.filter((g) => g.rsvpStatus === "declined").length;
  const dietary = allGuests.filter((g) => g.dietaryNotes !== null).length;
  const seats = allTables.reduce((n, t) => n + t.capacity, 0);
  const seated = allTables.reduce((n, t) => n + t.guests.length, 0);
  const days =
    settings.weddingDate !== null ? daysUntilNZ(settings.weddingDate) : null;

  const stageCounts = ["confirmed", "invited", "save_the_date", "not_invited"]
    .map((stage) => ({
      stage,
      count: allHouseholds.filter((h) => h.inviteStage === stage).length,
    }));
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.count));

  const stats = [
    { label: "Attending", value: attending.length, href: "/guests?rsvp=attending" },
    { label: "Awaiting reply", value: pending, href: "/guests?rsvp=pending" },
    { label: "Declined", value: declined, href: "/guests?rsvp=declined" },
    { label: "Dietary notes", value: dietary, href: "/guests" },
  ];

  return (
    <>
      {/* The invitation: the app's front page is the wedding itself. */}
      <section className="relative mx-auto max-w-3xl rounded-lg border border-hairline bg-card px-5 py-10 text-center shadow-card sm:px-8 sm:py-14">
        <CornerMark position="top-3 left-3 border-t border-l" />
        <CornerMark position="top-3 right-3 border-t border-r" />
        <CornerMark position="bottom-3 left-3 border-b border-l" />
        <CornerMark position="bottom-3 right-3 border-b border-r" />

        <Duogram a={settings.partnerAName} b={settings.partnerBName} tone="dark" />
        <p className="eyebrow mt-6 text-brass">Together with their families</p>
        {/* Long names have to fit a phone, so the display size steps up. */}
        <h1 className="mt-4 font-display text-[clamp(2rem,9vw,3rem)] leading-tight tracking-wide text-balance">
          {settings.partnerAName}{" "}
          <span className="text-brass">&amp;</span> {settings.partnerBName}
        </h1>
        {settings.weddingDate !== null && (
          <p className="mt-4 text-sm tracking-widest text-ink-soft uppercase">
            {formatDateLong(settings.weddingDate)}
          </p>
        )}
        {days !== null && days >= 0 && (
          <p className="mt-8 flex items-center justify-center gap-4 text-ink-soft">
            <span aria-hidden className="h-px w-12 bg-hairline-strong" />
            <span className="text-xs tracking-caps uppercase">
              <span className="figures text-base text-ink">{days}</span> days to
              go
            </span>
            <span aria-hidden className="h-px w-12 bg-hairline-strong" />
          </p>
        )}
      </section>

      {/* The ledger line: headline numbers as tabular figures. */}
      <section className="mx-auto mt-10 max-w-3xl">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-4">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="group bg-card px-5 py-4 transition-colors duration-150 hover:bg-brass-tint/30"
            >
              <dd className="figures text-2xl text-ink">{s.value}</dd>
              <dt className="eyebrow mt-1 text-ink-faint group-hover:text-brass">
                {s.label}
              </dt>
            </Link>
          ))}
        </dl>
      </section>

      <section className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-hairline bg-card p-6 shadow-card">
          <h2 className="eyebrow text-brass">Invitations by household</h2>
          <ul className="mt-4 space-y-3">
            {stageCounts.map(({ stage, count }) => (
              <li key={stage}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-ink-soft">{STAGE_LABELS[stage]}</span>
                  <span className="figures text-xs">{count}</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-paper">
                  <div
                    className={`h-1 rounded-full ${stage === "confirmed" ? "bg-fern" : stage === "not_invited" ? "bg-hairline-strong" : "bg-brass-bright"}`}
                    style={{ width: `${(count / maxStage) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/households"
            className="mt-5 inline-block text-xs font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
          >
            All households
          </Link>
        </div>

        <div className="rounded-lg border border-hairline bg-card p-6 shadow-card">
          <h2 className="eyebrow text-brass">Seating</h2>
          <p className="mt-4">
            <span className="figures text-2xl">{seated}</span>
            <span className="text-sm text-ink-soft">
              {" "}
              of <span className="figures">{seats}</span> seats assigned
            </span>
          </p>
          <div className="mt-3 h-1 rounded-full bg-paper">
            <div
              className="h-1 rounded-full bg-sage-mid"
              style={{ width: `${seats === 0 ? 0 : Math.min(100, (seated / seats) * 100)}%` }}
            />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-faint">
            {attending.length} attending so far against {seats} seats.
          </p>
          <div className="mt-3 flex gap-4">
            <Link
              href="/seating"
              className="text-xs font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
            >
              Seating plan
            </Link>
            <Link
              href="/tables"
              className="text-xs font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
            >
              All tables
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
