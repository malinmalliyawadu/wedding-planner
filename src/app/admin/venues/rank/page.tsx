import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { venueComparisons, venues } from "@/db/schema";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/queries";
import type { Comparison } from "@/lib/venue-ranking";
import { countsFromGuestList } from "../../budget/queries";
import { VenueDialog } from "../venue-dialog";
import { VenueTabs } from "../venue-tabs";
import { RankingBoard } from "./ranking-board";

export const dynamic = "force-dynamic";

export default async function VenueRankPage() {
  const [list, rows, guestListCounts, settings] = await Promise.all([
    db.select().from(venues).orderBy(asc(venues.name)),
    db.select().from(venueComparisons),
    countsFromGuestList(),
    getSettings(),
  ]);

  // Only the four columns the ranking reads. The board holds these in
  // client state and appends to them as you answer, so a tap lands
  // without a round trip - see the note in actions.ts.
  const comparisons: Comparison[] = rows.map((row) => ({
    venueAId: row.venueAId,
    venueBId: row.venueBId,
    winnerId: row.winnerId,
    judge: row.judge,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Which one"
        title="Ranking"
        actions={<VenueDialog />}
      >
        <p className="mt-4 max-w-2xl text-sm text-ink-soft">
          <span className="figures text-ink">{list.length}</span> venues is more
          than anyone can hold in their head, and rating them out of five would
          only produce a column of threes. So this asks the one question you can
          always answer - which of these two - and builds the order out of the
          answers. Nothing here looks at a price or a capacity:{" "}
          <Link
            href="/admin/venues"
            className="text-brass underline decoration-hairline-strong underline-offset-2 transition-colors duration-150 hover:decoration-brass"
          >
            the comparison
          </Link>{" "}
          settles that, and this settles the half it cannot.
        </p>
        <VenueTabs />
      </PageHeader>

      {list.length < 2 ? (
        <EmptyState
          title={list.length === 0 ? "No venues yet" : "One venue is not a ranking"}
          hint="Ranking works by comparing two places at a time, so there have to be two. Add the ones you are looking at, or import a shortlist you have already researched in a spreadsheet."
          action={<VenueDialog />}
        />
      ) : (
        <RankingBoard
          venues={list}
          initialComparisons={comparisons}
          counts={guestListCounts}
          catering={{
            perHeadCents: settings.cateringPerHeadCents,
            perChildCents: settings.cateringPerChildCents,
          }}
          nameA={settings.partnerAName}
          nameB={settings.partnerBName}
        />
      )}
    </>
  );
}
