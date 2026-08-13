import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getGallery,
  getInvitation,
  getSiteContent,
} from "@/lib/public/queries";
import { isStorageConfigured } from "@/lib/storage";
import { Ornament, Section } from "../../../sections";
import { Uploader } from "./uploader";

/**
 * The shared album.
 *
 * No envelope here: a guest arriving at this page has already opened
 * their invitation, and on the night they are getting here from a QR
 * code on the table, where a ceremony between them and the camera would
 * be an obstacle rather than a flourish.
 */
export const dynamic = "force-dynamic";

export default async function PhotosPage({
  params,
}: PageProps<"/i/[token]/photos">) {
  const { token } = await params;
  const [invitation, site] = await Promise.all([
    getInvitation(token),
    getSiteContent(),
  ]);
  if (!invitation || !site?.photosEnabled) notFound();

  const photos = await getGallery();

  return (
    <main id="main" className="pb-16">
      <div className="mx-auto w-full max-w-2xl px-6 pt-6">
        <Link
          href={`/i/${token}`}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to the invitation
        </Link>
      </div>

      <Section eyebrow="Everyone's photographs" title="The shared album">
        {/*
         * Said before a guest picks fifteen photographs, not after. The
         * gallery below still works: only adding is unavailable.
         */}
        {isStorageConfigured() ? (
          <Uploader token={token} />
        ) : (
          <div className="rounded-lg border border-dashed border-hairline-strong bg-card/60 px-6 py-8 text-center">
            <p className="font-display text-lg text-ink-soft">
              Adding photographs is not switched on yet
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-faint">
              Have a look at what is here in the meantime, and try again
              closer to the day.
            </p>
          </div>
        )}

        {photos.length === 0 ? (
          <div className="mt-10 text-center">
            <Ornament />
            <p className="mt-6 font-display text-lg text-ink-soft">
              Nothing here yet
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-faint">
              Be the first. Anything you take on the day belongs here.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-10 mb-4 text-center text-xs text-ink-faint">
              <span className="figures">{photos.length}</span>
              {photos.length === 1 ? " photograph" : " photographs"} so far
            </p>
            {/*
             * A two-up grid on a phone, four across on a desktop. Every
             * tile is square and the image covers it, so a mixed bag of
             * portrait and landscape phone photographs still reads as a
             * grid rather than a ransom note.
             */}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {photos.map((photo) => (
                <li key={photo.id} className="group">
                  <figure className="relative aspect-square overflow-hidden rounded-md border border-hairline bg-paper">
                    {/*
                     * A plain <img>, deliberately, and the one place in
                     * the app where that is the right answer. next/image
                     * would need `/_next/image` open to unauthenticated
                     * guests, and the optimiser will fetch any
                     * same-origin path it is handed - which would turn
                     * it into a way past basicauth into every private
                     * route that returns an image. The thumbnail was
                     * made on the guest's phone instead.
                     */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/i/photo/${photo.id}/thumb`}
                      alt={photo.caption ?? "A photograph from the day"}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 size-full object-cover"
                    />
                  </figure>
                  {(photo.caption || photo.uploaderName) && (
                    <p className="mt-1.5 px-0.5 text-xs leading-snug text-ink-faint">
                      {photo.caption}
                      {photo.caption && photo.uploaderName && " - "}
                      {photo.uploaderName}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </main>
  );
}
