"use client";

import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { useTransition } from "react";
import { setPhotoHidden } from "./actions";

/** One photograph, with the only control it needs. */
export function PhotoTile({
  id,
  caption,
  uploaderName,
  hidden,
}: {
  id: number;
  caption: string | null;
  uploaderName: string | null;
  hidden: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <li className="group">
      <figure
        className={`relative aspect-square overflow-hidden rounded-md border border-hairline bg-paper transition-opacity ${
          hidden ? "opacity-35" : ""
        }`}
      >
        <Image
          src={`/admin/photos/${id}/image`}
          alt={caption ?? "A guest photograph"}
          fill
          sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              void setPhotoHidden(id, !hidden);
            })
          }
          // Always reachable: on a phone there is no hover to reveal it.
          className="absolute right-1.5 bottom-1.5 inline-flex min-h-9 min-w-9 items-center justify-center rounded-md bg-spine/85 text-spine-ink backdrop-blur-sm transition-colors hover:bg-spine disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          {hidden ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
          <span className="sr-only">
            {hidden ? "Show this photograph again" : "Hide this photograph"}
          </span>
        </button>
      </figure>
      <p className="mt-1.5 text-xs leading-snug text-ink-faint">
        {hidden && <span className="text-madder">Hidden. </span>}
        {caption}
        {caption && uploaderName && " - "}
        {uploaderName}
      </p>
    </li>
  );
}
