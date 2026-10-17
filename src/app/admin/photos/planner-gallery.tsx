"use client";

import { Eye, EyeOff } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { PhotoGallery } from "@/components/gallery/photo-gallery";
import type { GalleryItem } from "@/lib/gallery";
import { setPhotoHidden } from "./actions";

/**
 * The album as the couple see it: the same gallery the guests get, with
 * hidden photographs left in (dimmed) and the one control moderation
 * needs, on every tile and in the lightbox.
 *
 * Hiding is applied at once and squared with the server after, so the
 * button answers the tap rather than the round trip - on venue wifi the
 * difference is whether a mis-tap looks like it did nothing.
 */
export function PlannerGallery({ photos }: { photos: GalleryItem[] }) {
  const [shown, setShown] = useOptimistic(
    photos,
    (state, change: { id: number; hidden: boolean }) =>
      state.map((photo) => (photo.id === change.id ? { ...photo, hidden: change.hidden } : photo)),
  );
  const [, startTransition] = useTransition();

  const toggle = (photo: GalleryItem) =>
    startTransition(async () => {
      setShown({ id: photo.id, hidden: !photo.hidden });
      await setPhotoHidden(photo.id, !photo.hidden);
    });

  return (
    <PhotoGallery
      source="planner"
      photos={shown}
      tileAction={(photo) => (
        <button
          type="button"
          onClick={() => toggle(photo)}
          // Always showing: on a phone there is no hover to reveal it.
          className="absolute right-1.5 bottom-1.5 inline-flex min-h-9 min-w-9 items-center justify-center rounded-md bg-spine/85 text-spine-ink backdrop-blur-sm transition-colors hover:bg-spine focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          {photo.hidden ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
          <span className="sr-only">
            {photo.hidden ? "Show this photograph again" : "Hide this photograph"}
          </span>
        </button>
      )}
      lightboxAction={(photo) => (
        <button type="button" onClick={() => toggle(photo)} className="lightbox-button">
          {photo.hidden ? (
            <Eye className="size-[1.1rem]" aria-hidden />
          ) : (
            <EyeOff className="size-[1.1rem]" aria-hidden />
          )}
          <span className="max-sm:sr-only">{photo.hidden ? "Show again" : "Hide"}</span>
        </button>
      )}
    />
  );
}
