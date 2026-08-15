import Link from "next/link";
import { asc } from "drizzle-orm";
import { FileUp } from "lucide-react";
import { db } from "@/db";
import { venues } from "@/db/schema";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/queries";
import { countsFromGuestList } from "../budget/queries";
import { VenueComparison } from "./venue-comparison";
import { VenueDialog } from "./venue-dialog";

export const dynamic = "force-dynamic";

export default async function VenuesPage() {
  const [list, guestListCounts, settings] = await Promise.all([
    db.select().from(venues).orderBy(asc(venues.name)),
    countsFromGuestList(),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Where it happens"
        title="Venues"
        actions={
          <>
            <Link
              href="/admin/venues/import"
              className="inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-card px-4 py-2 text-sm font-medium transition-colors duration-150 hover:border-ink-faint hover:bg-white"
            >
              <FileUp size={15} aria-hidden />
              Import CSV
            </Link>
            <VenueDialog />
          </>
        }
      >
        <p className="mt-4 max-w-2xl text-sm text-ink-soft">
          What each place costs at your guest count, whether everyone fits and
          whether the date is free. The comparison stops at facts on purpose -
          how somewhere feels is in the notes, and no column here should look
          like it has settled that.
        </p>
      </PageHeader>

      {list.length === 0 ? (
        <EmptyState
          title="No venues yet"
          hint="Add the places you are looking at, or import a shortlist you have already researched in a spreadsheet. Split the price the way they quote it: a hire fee, a per-head rate, and a minimum spend if they have one. Leave the per-head blank for a venue that does not cater, and an outside caterer is priced in for you. Leave the hire fee blank until they quote one - it will not be guessed at."
          action={<VenueDialog />}
        />
      ) : (
        <VenueComparison
          venues={list}
          guestListCounts={guestListCounts}
          catering={{
            perHeadCents: settings.cateringPerHeadCents,
            perChildCents: settings.cateringPerChildCents,
          }}
        />
      )}
    </>
  );
}
