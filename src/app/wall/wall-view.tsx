"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type WallPhoto = {
  id: number;
  caption: string | null;
  uploaderName: string | null;
};

const HOLD_MS = 7000;
const POLL_MS = 20000;

/**
 * The photo wall, for a projector in the marquee.
 *
 * Two clocks. One advances the picture every few seconds; the other asks
 * the server for new uploads, so a photograph taken on the dance floor
 * is on the wall within half a minute without anyone touching the laptop.
 *
 * New photographs are inserted at the front of the list, but the index is
 * kept pointing at the same *photograph* rather than the same slot -
 * otherwise every upload would yank the wall back to something the room
 * has already seen.
 */
export function WallView({ photos }: { photos: WallPhoto[] }) {
  const router = useRouter();
  const [currentId, setCurrentId] = useState<number | null>(
    photos[0]?.id ?? null,
  );

  /*
   * Derived, not stored. If the photograph on screen has just been
   * hidden it drops out of the list, findIndex returns -1, and the wall
   * falls back to the newest one on the very next render - no effect
   * chasing the state back into range, and no frame showing nothing.
   */
  const index = Math.max(
    0,
    photos.findIndex((photo) => photo.id === currentId),
  );
  const current = photos[index];

  useEffect(() => {
    if (photos.length < 2) return;
    const timer = setInterval(() => {
      setCurrentId((id) => {
        const at = photos.findIndex((photo) => photo.id === id);
        return photos[(at + 1) % photos.length].id;
      });
    }, HOLD_MS);
    return () => clearInterval(timer);
  }, [photos]);

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [router]);

  if (photos.length === 0 || !current) {
    return (
      <div className="grid min-h-dvh place-items-center bg-spine px-8 text-center">
        <div>
          <p className="eyebrow text-spine-ink-soft">The shared album</p>
          <p className="mt-4 font-display text-3xl text-spine-ink">
            Waiting for the first photograph
          </p>
          <p className="mt-3 text-sm text-spine-ink-soft">
            Guests can add theirs from the QR code on the table.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-spine">
      {/*
       * Every photograph stays mounted and is cross-faded by opacity.
       * Swapping the src instead would show a blank frame while the next
       * image decodes, which on a projector reads as a fault.
       */}
      {photos.map((photo, at) => (
        <div
          key={photo.id}
          className="absolute inset-0 transition-opacity duration-[1200ms] ease-out"
          style={{ opacity: at === index ? 1 : 0 }}
          aria-hidden={at !== index}
        >
          <Image
            src={`/admin/photos/${photo.id}/image`}
            alt={photo.caption ?? "A photograph from the day"}
            fill
            sizes="100vw"
            className="object-contain"
            // The next one up is worth having decoded already.
            priority={Math.abs(at - index) <= 1}
          />
        </div>
      ))}

      {(current.caption || current.uploaderName) && (
        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-spine via-spine/80 to-transparent px-10 pt-16 pb-8 text-center text-lg text-spine-ink">
          {current.caption}
          {current.caption && current.uploaderName && (
            <span className="text-spine-ink-soft"> - </span>
          )}
          {current.uploaderName && (
            <span className="text-spine-ink-soft">{current.uploaderName}</span>
          )}
        </p>
      )}

      <p className="figures absolute top-6 right-8 text-xs text-spine-ink-soft/70">
        {index + 1} / {photos.length}
      </p>
    </div>
  );
}
