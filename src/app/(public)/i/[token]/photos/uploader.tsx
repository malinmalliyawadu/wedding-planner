"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImagePrepError, prepareImage } from "@/lib/image-prep";
import { useRemembered } from "@/lib/use-remembered";
import { recordUpload, requestUpload } from "./actions";

/**
 * Uploading, from a phone, at a wedding.
 *
 * Files go one at a time rather than all at once: marquee wifi is not
 * marketing wifi, and a serial queue means a guest who picks fifteen
 * photographs sees the first ones land instead of watching fifteen
 * stalled requests fight each other. Each file is resized on the device
 * first (see @/lib/image-prep), so what crosses the network is a few
 * hundred kilobytes rather than several megabytes.
 *
 * One failure does not stop the queue. Somebody's odd screenshot should
 * not cost them the other fourteen photographs.
 */

type Item = {
  id: string;
  name: string;
  status: "waiting" | "working" | "done" | "failed";
  message?: string;
};

const NAME_KEY = "wl-uploader-name";

export function Uploader({ token }: { token: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  // Nobody wants to type their name again for the second batch.
  const [name, setName] = useRemembered(NAME_KEY);
  const [caption, setCaption] = useState("");

  function update(id: string, patch: Partial<Item>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function upload(file: File, id: string) {
    update(id, { status: "working" });

    const prepared = await prepareImage(file);

    // A full-size copy and a thumbnail, each with its own ticket.
    const [full, thumb] = await Promise.all([
      sendToBucket(prepared.full),
      sendToBucket(prepared.thumb),
    ]);

    const recorded = await recordUpload(token, {
      storageKey: full,
      thumbStorageKey: thumb,
      caption,
      uploaderName: name,
      width: prepared.width,
      height: prepared.height,
    });
    if (!recorded.ok) throw new Error(recorded.message);
  }

  /** Returns the key the object landed on. */
  async function sendToBucket(blob: Blob): Promise<string> {
    const permission = await requestUpload(token);
    if (!permission.ok) throw new Error(permission.message);

    // Straight to the bucket. The fields must precede the file part -
    // S3 reads the policy before it reads the body and rejects the whole
    // request otherwise.
    const form = new FormData();
    for (const [key, value] of Object.entries(permission.ticket.fields)) {
      form.append(key, value);
    }
    form.append("file", blob, "photo.jpg");

    const response = await fetch(permission.ticket.url, {
      method: "POST",
      body: form,
    });
    if (!response.ok) throw new Error("The upload did not go through");

    return permission.ticket.key;
  }

  async function onFiles(files: FileList) {
    const queued: Item[] = Array.from(files).map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      status: "waiting",
    }));
    setItems(queued);
    setBusy(true);

    let landed = 0;
    for (const [index, file] of Array.from(files).entries()) {
      const item = queued[index];
      try {
        await upload(file, item.id);
        update(item.id, { status: "done" });
        landed++;
      } catch (error) {
        update(item.id, {
          status: "failed",
          message:
            error instanceof ImagePrepError || error instanceof Error
              ? error.message
              : "Something went wrong",
        });
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    // Only disturb the page if there is something new on it.
    if (landed > 0) router.refresh();
  }

  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "failed");

  return (
    <div className="rounded-lg border border-hairline bg-card p-6 shadow-card sm:p-8">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-soft">
            Your name
          </span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="So we know who to thank"
            className="w-full rounded-md border border-hairline-strong bg-white px-3 py-2 text-sm text-ink transition-colors duration-150 placeholder:text-ink-faint focus:border-brass focus:outline-none pointer-coarse:min-h-11 pointer-coarse:text-base"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-soft">
            A note about these ones
          </span>
          <input
            type="text"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={280}
            placeholder="Optional"
            className="w-full rounded-md border border-hairline-strong bg-white px-3 py-2 text-sm text-ink transition-colors duration-150 placeholder:text-ink-faint focus:border-brass focus:outline-none pointer-coarse:min-h-11 pointer-coarse:text-base"
          />
        </label>
      </div>

      <input
        ref={inputRef}
        id="photo-input"
        type="file"
        accept="image/*"
        multiple
        disabled={busy}
        className="sr-only"
        onChange={(event) => {
          const files = event.target.files;
          if (files && files.length > 0) void onFiles(files);
        }}
      />
      <label
        htmlFor="photo-input"
        className={`mt-6 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-ink px-6 text-sm font-medium text-paper transition-colors duration-150 hover:bg-spine-raised ${
          busy ? "pointer-events-none opacity-45" : ""
        }`}
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Sending {done + 1} of {items.length}…
          </>
        ) : (
          <>
            <ImagePlus className="size-4" aria-hidden />
            Choose photographs
          </>
        )}
      </label>

      {/* Announced politely so a screen reader hears the outcome without
          being interrupted mid-sentence for every file in the queue. */}
      <div aria-live="polite" className="mt-4 space-y-1 text-sm">
        {!busy && done > 0 && (
          <p className="text-fern">
            {done === 1 ? "One photograph added" : `${done} photographs added`}
            . Thank you.
          </p>
        )}
        {failed.map((item) => (
          <p key={item.id} className="text-madder">
            {item.name}: {item.message}
          </p>
        ))}
      </div>

      <p className="mt-4 text-xs text-ink-faint">
        Photographs are resized on your phone before they are sent, so this
        works on the venue&rsquo;s wifi and does not eat your data.
      </p>
    </div>
  );
}
