import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isBoothSessionId } from "@/lib/booth";
import { getBoothPhoto, getSiteContent } from "@/lib/public/queries";
import { Motif } from "../../../motifs";
import { Ornament, Rise } from "../../../sections";
import { Refresh } from "./refresh";

/**
 * What the photo booth's QR code opens.
 *
 * A guest scans it on the kiosk seconds after their photographs were
 * taken, usually before the booth has finished sending them, so the
 * page has two states and moves from one to the other by itself. No
 * envelope and no ribbon: there is no invitation token here to lead
 * back to, only the one photograph, and the thing to do with it is
 * save it.
 *
 * `booth` can never be a token - tokens are twenty characters and this
 * is five - so the path sits under `/i` with the rest of the public
 * surface, and is served without a sign-in like the album is.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your photographs",
};

export default async function BoothPhotoPage({ params }: PageProps<"/i/booth/[id]">) {
  const { id } = await params;
  // A mistyped or made-up ID is a 404, not a page waiting for a booth
  // that is never going to send anything under it.
  if (!isBoothSessionId(id)) notFound();
  const site = await getSiteContent();
  if (!site) notFound();

  const photo = await getBoothPhoto(id);
  // Hidden by the couple: gone from here as it is gone from the album,
  // rather than a page that waits forever for something not coming.
  if (photo?.hidden) notFound();

  const ratio = photo?.width && photo?.height ? `${photo.width} / ${photo.height}` : "148 / 100";

  return (
    <main
      id="main"
      className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center px-5 py-14 text-center sm:px-6 sm:py-20"
    >
      <Rise as="header">
        <p className="eyebrow text-brass">From the photo booth</p>
        <h1 className="mt-3 font-display text-[clamp(1.85rem,6.5vw,2.75rem)] leading-tight text-ink">
          Your photographs
        </h1>
        <Ornament motif="camera" className="mt-5" />
      </Rise>

      {photo ? (
        <>
          <Rise as="section" className="mt-10 w-full">
            <figure className="bg-card p-2 shadow-card sm:p-3">
              <span className="block overflow-hidden bg-paper" style={{ aspectRatio: ratio }}>
                {/* A plain <img>: `/_next/image` stays shut to guests, as in the album. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/i/photo/${photo.id}`}
                  alt="Your photographs from the booth"
                  width={photo.width ?? undefined}
                  height={photo.height ?? undefined}
                  decoding="async"
                  className="size-full object-contain"
                />
              </span>
            </figure>
          </Rise>
          <Rise className="mt-8 flex w-full flex-col items-center gap-5">
            <a
              href={`/i/photo/${photo.id}`}
              download="photo-booth.jpg"
              className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-full bg-ink px-8 text-[0.8125rem] font-semibold tracking-caps text-paper uppercase transition-colors hover:bg-spine-raised"
            >
              Save to your phone
            </a>
            <p className="formula max-w-sm text-[1.15rem] leading-relaxed text-ink-soft">
              It is in the album on your invitation too, alongside everyone
              else&apos;s photographs from the day.
            </p>
          </Rise>
        </>
      ) : (
        <Rise as="section" className="mt-10 flex w-full flex-col items-center">
          <div className="w-full bg-card p-2 shadow-card sm:p-3">
            <div
              className="flex items-center justify-center bg-paper"
              style={{ aspectRatio: ratio }}
            >
              <svg viewBox="0 0 24 24" className="size-8 animate-pulse text-brass-bright" aria-hidden>
                <Motif name="camera" />
              </svg>
            </div>
          </div>
          <p className="mt-8 font-display text-xl text-ink-soft">On its way</p>
          <p className="formula mx-auto mt-2 max-w-sm text-[1.15rem] leading-relaxed text-ink-faint">
            The booth is sending your photographs over. This page will show
            them as soon as they arrive; there is nothing to press.
          </p>
          <Refresh />
        </Rise>
      )}
    </main>
  );
}
