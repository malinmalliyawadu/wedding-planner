import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { djQueueItems } from "@/db/schema";
import { findCover } from "./song-search";

/**
 * Album covers for the dance floor's queue.
 *
 * Looked up by the server, from the same catalogue search the reply card
 * uses, and kept only when the catalogue's song is the same song
 * (`coverFor`). Never taken from the request: a cover is shown to every
 * other guest, so a URL a guest's browser could choose would be a picture
 * of their choosing on everyone's phone.
 *
 * It runs after the response has gone (`after`), so asking for a song is
 * never slowed down by the catalogue, and a cover that cannot be found
 * costs nothing but its absence. The pages poll, so it appears on the
 * next refresh.
 */

/** At a time, under the catalogue's shared rate limit, for a big import. */
const AT_ONCE = 4;

export function fillCoversLater(ids: readonly number[]): void {
  if (ids.length === 0) return;
  after(async () => {
    for (let i = 0; i < ids.length; i += AT_ONCE) {
      await Promise.all(ids.slice(i, i + AT_ONCE).map(fillCover));
    }
  });
}

async function fillCover(id: number): Promise<void> {
  const [row] = await db
    .select({ title: djQueueItems.title, artist: djQueueItems.artist, coverUrl: djQueueItems.coverUrl })
    .from(djQueueItems)
    .where(eq(djQueueItems.id, id))
    .limit(1);
  if (!row || row.coverUrl !== null) return;
  const cover = await findCover(row.title, row.artist);
  if (cover) await db.update(djQueueItems).set({ coverUrl: cover }).where(eq(djQueueItems.id, id));
}
