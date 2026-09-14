import { notFound } from "next/navigation";
import {
  getGallery,
  getInvitation,
  getSiteContent,
} from "@/lib/public/queries";
import { isStorageConfigured } from "@/lib/storage";
import { Motif } from "../../../motifs";
import { Ribbon } from "../../../ribbon";
import { Ornament, Rise, Section } from "../../../sections";
import { Gallery } from "./gallery";
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
  const initialA = (site.partnerAName[0] ?? "A").toUpperCase();
  const initialB = (site.partnerBName[0] ?? "B").toUpperCase();

  return (
    <>
      <Ribbon
        monogram={{ a: initialA, b: initialB }}
        links={[
          { id: "add", label: "Add yours" },
          { id: "album", label: "The album" },
        ]}
        cta={{ href: `/i/${token}`, label: "Invitation" }}
      />

      <main id="main" data-invitation="" className="overflow-x-clip pt-14 pb-20">
        <Section
          id="add"
          eyebrow="Everyone's photographs"
          title="The album"
          motif="camera"
          intro="Whatever you caught on the day belongs here, alongside everyone else's."
        >
          <Rise>
            {/*
             * Said before a guest picks fifteen photographs, not after.
             * The album below still works: only adding is unavailable.
             */}
            {isStorageConfigured() ? (
              <Uploader token={token} />
            ) : (
              <div className="border border-dashed border-hairline-strong px-6 py-10 text-center">
                <p className="font-display text-lg text-ink-soft">
                  Adding photographs is not switched on yet
                </p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-ink-faint">
                  Have a look at what is here in the meantime, and try again
                  closer to the day.
                </p>
              </div>
            )}
          </Rise>
        </Section>

        <section id="album" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 sm:px-6">
          {photos.length === 0 ? (
            <Rise className="py-10 text-center">
              <svg viewBox="0 0 24 24" className="mx-auto size-8 text-brass-bright" aria-hidden>
                <Motif name="camera" />
              </svg>
              <p className="mt-5 font-display text-xl text-ink-soft">Nothing here yet</p>
              <p className="formula mx-auto mt-2 max-w-sm text-[1.15rem] text-ink-faint">
                Be the first. Anything you take on the day belongs here.
              </p>
            </Rise>
          ) : (
            <>
              <Rise className="mb-8 text-center">
                <Ornament />
                <p className="mt-5 text-sm text-ink-faint">
                  <span className="font-display text-base text-ink">{photos.length}</span>
                  {photos.length === 1 ? " photograph" : " photographs"} so far, newest first
                </p>
              </Rise>
              <Gallery photos={photos} />
            </>
          )}
        </section>
      </main>
    </>
  );
}
