import { desc } from "drizzle-orm";
import Link from "next/link";
import { MonitorPlay } from "lucide-react";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { EmptyState, PageHeader } from "@/components/ui";
import { isStorageConfigured } from "@/lib/storage";
import { PhotoTile } from "./photo-tile";

export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const rows = await db
    .select()
    .from(photos)
    .orderBy(desc(photos.createdAt), desc(photos.id));

  const hidden = rows.filter((photo) => photo.hidden).length;

  return (
    <>
      <PageHeader
        eyebrow="What guests sent"
        title="Photographs"
        actions={
          <Link
            href="/wall"
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-hairline-strong bg-card px-4 text-sm text-ink transition-colors hover:border-ink-faint"
          >
            <MonitorPlay className="size-4" aria-hidden />
            Open the wall
          </Link>
        }
      >
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          Hiding a photograph takes it off the album and off the wall
          straight away. Nothing is ever deleted here, so a mis-tap costs
          you nothing.
        </p>
      </PageHeader>

      {!isStorageConfigured() && (
        <p className="mb-6 rounded-md border border-brass/30 bg-brass-tint/50 px-4 py-3 text-sm text-brass">
          Photo storage is not configured on this deployment, so uploads
          will fail and existing photographs cannot be shown. See the
          object storage section of DEPLOYMENT.md.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No photographs yet"
          hint="They will appear here as guests add them from their invitation links."
        />
      ) : (
        <>
          <p className="mb-4 text-xs text-ink-faint">
            <span className="figures">{rows.length}</span> in all
            {hidden > 0 && (
              <>
                {", "}
                <span className="figures">{hidden}</span> hidden
              </>
            )}
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {rows.map((photo) => (
              <PhotoTile
                key={photo.id}
                id={photo.id}
                caption={photo.caption}
                uploaderName={photo.uploaderName}
                hidden={photo.hidden}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}
