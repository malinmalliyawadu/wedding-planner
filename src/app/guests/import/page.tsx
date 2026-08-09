import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <>
      <PageHeader eyebrow="The guest list" title="Import guests">
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          Bring the list over from a spreadsheet. Rows sharing a household
          value are grouped into one household; guests who already exist are
          skipped, so importing twice is safe. Blank side defaults to both,
          blank age to adult.
        </p>
        <Link
          href="/guests"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink"
        >
          <ArrowLeft size={13} aria-hidden />
          Back to guests
        </Link>
      </PageHeader>
      <ImportClient />
    </>
  );
}
