"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The album, and the lightbox behind it.
 *
 * Prints at their own proportions, laid in columns, rather than a grid
 * of squares: a portrait of the bride's grandmother cropped to a square
 * loses her hat. The width and height were recorded at upload for
 * exactly this, so every tile reserves its own box and the page does
 * not reflow as the thumbnails arrive.
 *
 * Tap one and it opens on a native <dialog> - dismissal is the
 * platform's, the arrow keys move along the album, and the full-size
 * copy is fetched only when it is asked for.
 */
export type AlbumPhoto = {
  id: number;
  caption: string | null;
  uploaderName: string | null;
  width: number | null;
  height: number | null;
};

export function Gallery({ photos }: { photos: AlbumPhoto[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<number | null>(null);

  const show = useCallback((index: number) => {
    setOpen(index);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const step = useCallback(
    (delta: number) => {
      setOpen((current) => {
        if (current === null) return current;
        return (current + delta + photos.length) % photos.length;
      });
    },
    [photos.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step]);

  const current = open === null ? null : photos[open];

  return (
    <>
      <ul className="columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4">
        {photos.map((photo, index) => {
          const ratio =
            photo.width && photo.height ? `${photo.width} / ${photo.height}` : "1 / 1";
          return (
            <li key={photo.id} className="mb-3 break-inside-avoid sm:mb-4">
              <button
                type="button"
                onClick={() => show(index)}
                className="group block w-full bg-card p-1.5 text-left shadow-card transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
                aria-label={
                  photo.caption
                    ? `Open photograph: ${photo.caption}`
                    : "Open photograph"
                }
              >
                <span className="block overflow-hidden bg-paper" style={{ aspectRatio: ratio }}>
                  {/*
                   * A plain <img>, deliberately. next/image would need
                   * `/_next/image` open to unauthenticated guests, and
                   * the optimiser will fetch any same-origin path it is
                   * handed. The thumbnail was made on the guest's phone
                   * instead.
                   */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/i/photo/${photo.id}/thumb`}
                    alt={photo.caption ?? "A photograph from the day"}
                    width={photo.width ?? undefined}
                    height={photo.height ?? undefined}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                </span>
                {(photo.caption || photo.uploaderName) && (
                  <span className="block px-1 pt-2 pb-1 text-xs leading-snug text-ink-faint">
                    {photo.caption && <span className="text-ink-soft">{photo.caption}</span>}
                    {photo.caption && photo.uploaderName && " · "}
                    {photo.uploaderName}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <dialog
        ref={dialogRef}
        className="lightbox"
        onClose={() => setOpen(null)}
        // A click on the backdrop lands on the dialog element itself;
        // anything inside stops it.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        aria-label="Photograph"
      >
        {current && (
          <div className="flex h-full w-full flex-col items-center justify-center p-4 sm:p-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current.id}
              src={`/i/photo/${current.id}`}
              alt={current.caption ?? "A photograph from the day"}
              className="max-h-[80dvh] max-w-full animate-fade object-contain shadow-overlay"
            />
            <p className="mt-4 max-w-xl text-center text-sm text-spine-ink-soft">
              {current.caption && <span className="text-spine-ink">{current.caption}</span>}
              {current.caption && current.uploaderName && " · "}
              {current.uploaderName}
              <span className="figures ml-3 text-xs text-spine-ink-soft/70">
                {(open ?? 0) + 1} / {photos.length}
              </span>
            </p>

            <button
              type="button"
              onClick={close}
              className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full text-spine-ink transition-colors hover:bg-white/10"
              aria-label="Close"
            >
              <X className="size-5" aria-hidden />
            </button>
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  className="absolute top-1/2 left-2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-spine-ink transition-colors hover:bg-white/10 sm:left-4"
                  aria-label="Previous photograph"
                >
                  <ChevronLeft className="size-6" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  className="absolute top-1/2 right-2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-spine-ink transition-colors hover:bg-white/10 sm:right-4"
                  aria-label="Next photograph"
                >
                  <ChevronRight className="size-6" aria-hidden />
                </button>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
