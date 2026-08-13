import { asc } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { faqItems, publicSite } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { ContentForm } from "./content-form";
import { FaqEditor } from "./faq-editor";

export const dynamic = "force-dynamic";

export default async function SiteContentPage() {
  const [[site], faq] = await Promise.all([
    db.select().from(publicSite).limit(1),
    db
      .select()
      .from(faqItems)
      .orderBy(asc(faqItems.sortOrder), asc(faqItems.id)),
  ]);

  return (
    <>
      <div className="mb-4">
        <Link
          href="/admin/invitations"
          className="inline-flex min-h-9 items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Invitations
        </Link>
      </div>

      <PageHeader eyebrow="The public side" title="What the invitation says">
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          The schedule guests see is not here - it comes from the run
          sheet, from whichever moments are ticked as guest-facing, so the
          two can never drift apart.
        </p>
      </PageHeader>

      <div className="max-w-3xl">
        <ContentForm
          values={{
            welcomeMessage: site?.welcomeMessage ?? null,
            venueName: site?.venueName ?? null,
            venueAddress: site?.venueAddress ?? null,
            venueMapUrl: site?.venueMapUrl ?? null,
            arrivalTime: site?.arrivalTime ?? null,
            ceremonyTime: site?.ceremonyTime ?? null,
            dressCode: site?.dressCode ?? null,
            giftNote: site?.giftNote ?? null,
            travelNotes: site?.travelNotes ?? null,
            accommodationNotes: site?.accommodationNotes ?? null,
            rsvpDeadline: site?.rsvpDeadline ?? null,
            photosEnabled: site?.photosEnabled ?? true,
            tableRevealEnabled: site?.tableRevealEnabled ?? false,
          }}
        />

        <FaqEditor items={faq} />
      </div>
    </>
  );
}
