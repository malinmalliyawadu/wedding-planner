import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default function ImportVenuesPage() {
  return (
    <>
      <PageHeader eyebrow="Where it happens" title="Import venues">
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          Bring a shortlist over from a spreadsheet. Column names are
          matched loosely, so a file researched for the purpose usually
          imports as it stands - and every column this cannot turn into a
          number is kept whole in the venue&rsquo;s notes rather than
          dropped. Venues already on the list are skipped, so importing
          twice is safe.
        </p>
        <Link
          href="/admin/venues"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink"
        >
          <ArrowLeft size={13} aria-hidden />
          Back to venues
        </Link>
      </PageHeader>
      <ImportClient />
    </>
  );
}
