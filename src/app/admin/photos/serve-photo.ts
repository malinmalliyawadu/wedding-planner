import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { getObject } from "@/lib/storage";

/**
 * Streams a photograph to the couple, hidden ones included.
 *
 * The public routes under /i/photo deliberately refuse anything hidden,
 * which is what makes hiding work - but it also means the couple could
 * not see what they had hidden in order to unhide it. The routes that
 * call this are the counterpart, and they sit behind the same sign-in as
 * the guest list and the budget.
 *
 * A route handler renders no layout, so the guard the planner's pages get
 * for free is written out here. The proxy has already refused an
 * unauthenticated request; this is the same second lock the layout is.
 *
 * Pages must load these with a plain `<img>`, never `next/image`. The
 * optimiser fetches the source itself, server-side and without the
 * browser's cookie, so it meets the sign-in instead of a photograph and
 * answers 400 "isn't a valid image". The grid uses the thumbnail made on
 * the guest's phone instead, exactly as the album does.
 */
export async function servePhoto(
  rawId: string,
  size: "full" | "thumb",
): Promise<Response> {
  await requireAdmin();

  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return new Response("Not found", { status: 404 });
  }

  const [row] = await db
    .select({
      storageKey: photos.storageKey,
      thumbStorageKey: photos.thumbStorageKey,
    })
    .from(photos)
    .where(eq(photos.id, id))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });

  // A photograph from before thumbnails existed still appears, just
  // heavier - the same fallback the public album makes.
  const key =
    size === "thumb" ? (row.thumbStorageKey ?? row.storageKey) : row.storageKey;
  const object = await getObject(key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType,
      ...(object.contentLength
        ? { "Content-Length": String(object.contentLength) }
        : {}),
      "Cache-Control": "private, max-age=3600, must-revalidate",
    },
  });
}
