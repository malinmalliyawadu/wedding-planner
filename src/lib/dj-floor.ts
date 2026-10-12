import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { djFloor, djQueueItems, djVotes, songRequests } from "@/db/schema";
import { verifyBearerToken } from "./bearer";
import { fillCoversLater } from "./dj-cover";
import { newInviteToken } from "./invite-token";
import {
  ACTIVE_STATUSES,
  SKIP_GAP_MS,
  nextToCue,
  planOnAir,
  shouldSkip,
  staleCues,
  tally,
  transition,
  type OnAir,
  type QueueEvent,
  type QueueItem,
  type Vote,
} from "./dj-queue";
import { buildPlaylist, songKey } from "./songs";

/**
 * The dance floor's database half, for the planner and the DJ bridge.
 * The decisions are all in `dj-queue.ts`; this reads rows into its
 * shapes and writes back what it decided. Nothing in here may be
 * imported from `(public)` - guests go through `src/lib/public/`.
 */

export type FloorSettings = typeof djFloor.$inferSelect;
export type QueueRow = typeof djQueueItems.$inferSelect;

const DEFAULT_FLOOR: FloorSettings = {
  id: 1,
  access: "closed",
  skipVotesNeeded: 5,
  bridgeSeenAt: null,
  shareCode: null,
};

export async function getFloor(): Promise<FloorSettings> {
  const [row] = await db.select().from(djFloor).limit(1);
  return row ?? DEFAULT_FLOOR;
}

export async function updateFloor(
  values: Partial<Pick<FloorSettings, "access" | "skipVotesNeeded" | "bridgeSeenAt" | "shareCode">>,
): Promise<void> {
  await db
    .insert(djFloor)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: djFloor.id, set: values });
}

/**
 * Make a new secret for the venue's QR code, retiring the old one: every
 * printed copy of it stops working at once. An invite token's shape and
 * strength, because it is the same kind of thing - a link that is the
 * credential.
 */
export async function replaceShareCode(): Promise<void> {
  await updateFloor({ shareCode: newInviteToken() });
}

/** The URL in the venue's QR code. `origin` carries no trailing slash. */
export function danceShareUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/i/dance/${code}`;
}

/**
 * Everything the queue logic needs: every active request, everything that
 * ended recently enough to matter (the skip gap, and the songs counted
 * by `staleCues`), and the votes on all of them.
 */
export async function loadQueue(now: Date = new Date()): Promise<{
  items: QueueRow[];
  votes: Vote[];
}> {
  const since = new Date(now.getTime() - SKIP_GAP_MS);
  const items = await db
    .select()
    .from(djQueueItems)
    .where(
      or(
        inArray(djQueueItems.status, [...ACTIVE_STATUSES]),
        gt(djQueueItems.endedAt, since),
      ),
    );
  const votes =
    items.length === 0
      ? []
      : await db
          .select({
            itemId: djVotes.itemId,
            householdId: djVotes.householdId,
            phoneKey: djVotes.phoneKey,
            kind: djVotes.kind,
          })
          .from(djVotes)
          .where(inArray(djVotes.itemId, items.map((item) => item.id)));
  return { items, votes };
}

/** The last few songs that finished, newest first, for the planner's history. */
export async function recentHistory(limit = 25): Promise<QueueRow[]> {
  return db
    .select()
    .from(djQueueItems)
    .where(inArray(djQueueItems.status, ["played", "skipped", "unavailable", "removed"]))
    .orderBy(desc(djQueueItems.endedAt), desc(djQueueItems.id))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Changes. Each one re-checks the transition against the row as it is now,
// so a late or repeated report changes nothing.

/** Apply one event to one request. False when it could not happen from there. */
export async function applyEvent(
  itemId: number,
  event: Exclude<QueueEvent, "started" | "ended">,
  note: string | null = null,
): Promise<boolean> {
  const [row] = await db
    .select({ status: djQueueItems.status })
    .from(djQueueItems)
    .where(eq(djQueueItems.id, itemId))
    .limit(1);
  if (!row) return false;
  const next = transition(row.status, event);
  if (next === null) return false;

  const now = new Date();
  await db
    .update(djQueueItems)
    .set({
      status: next,
      ...(next === "cued" ? { cuedAt: now, note: null } : {}),
      ...(next === "unavailable" ? { note } : {}),
      ...(next === "removed" || next === "unavailable" ? { endedAt: now } : {}),
    })
    .where(and(eq(djQueueItems.id, itemId), eq(djQueueItems.status, row.status)));
  return true;
}

/**
 * Record what is on air now. Ends what was playing, starts the request
 * that has come on, or adds the DJ's own choice to the list so that the
 * floor can vote to skip that too.
 */
export async function recordOnAir(seen: OnAir | null): Promise<void> {
  const [{ items, votes }, floor] = await Promise.all([loadQueue(), getFloor()]);
  const skipVotes = tally(votes, "skip");
  const votedOff = new Set(
    items
      .filter((item) => shouldSkip(item, skipVotes.get(item.id) ?? 0, floor.skipVotesNeeded))
      .map((item) => item.id),
  );
  const plan = planOnAir(items, seen, votedOff);
  const now = new Date();

  const created = await db.transaction(async (tx) => {
    for (const ended of plan.end) {
      await tx
        .update(djQueueItems)
        .set({ status: ended.status, endedAt: now })
        .where(and(eq(djQueueItems.id, ended.id), eq(djQueueItems.status, "playing")));
    }
    if (plan.start !== null) {
      await tx
        .update(djQueueItems)
        .set({ status: "playing", startedAt: now })
        .where(eq(djQueueItems.id, plan.start));
    }
    if (plan.create === null) return [];
    return tx
      .insert(djQueueItems)
      .values({
        title: plan.create.title,
        artist: plan.create.artist,
        songKey: songKey(plan.create.title, plan.create.artist),
        householdId: null,
        status: "playing",
        startedAt: now,
      })
      // The same song cannot be active twice; if it somehow is, the
      // row that is already there stands for it.
      .onConflictDoNothing()
      .returning({ id: djQueueItems.id });
  });
  fillCoversLater(created.map((row) => row.id));
}

/**
 * Skip it: now if it is on air, when it comes on if djay already has it,
 * or simply take it off the list if it is still the app's.
 */
export async function removeOrSkip(itemId: number): Promise<void> {
  const [row] = await db
    .select({ status: djQueueItems.status })
    .from(djQueueItems)
    .where(eq(djQueueItems.id, itemId))
    .limit(1);
  if (!row) return;
  if (row.status === "queued") {
    await applyEvent(itemId, "removed");
    return;
  }
  if (row.status === "cued" || row.status === "playing") {
    await db
      .update(djQueueItems)
      .set({ skipRequested: true })
      .where(eq(djQueueItems.id, itemId));
  }
}

export async function addCoupleSong(song: {
  title: string;
  artist: string | null;
}): Promise<"added" | "already_queued"> {
  const rows = await db
    .insert(djQueueItems)
    .values({
      title: song.title,
      artist: song.artist,
      songKey: songKey(song.title, song.artist),
      householdId: null,
    })
    .onConflictDoNothing()
    .returning({ id: djQueueItems.id });
  fillCoversLater(rows.map((row) => row.id));
  return rows.length > 0 ? "added" : "already_queued";
}

/**
 * Put every song from the reply cards on the queue, each with a vote from
 * every household that asked for it - so the most-requested go first, as
 * they do on the playlist page. A song already on the list, or played in
 * the last little while, is left alone; pressing it twice adds nothing.
 * The per-household cap is a guard on guests, not on the couple, and does
 * not apply.
 */
export async function importReplyCardSongs(): Promise<number> {
  const requests = await db
    .select({
      householdId: songRequests.householdId,
      title: songRequests.title,
      artist: songRequests.artist,
    })
    .from(songRequests)
    .orderBy(songRequests.id);
  const { items } = await loadQueue();
  const taken = new Set(items.map((item) => item.songKey));

  const added: number[] = [];
  for (const entry of buildPlaylist(requests)) {
    const key = songKey(entry.title, entry.artist);
    if (taken.has(key)) continue;
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(djQueueItems)
        .values({
          title: entry.title,
          artist: entry.artist,
          songKey: key,
          householdId: entry.householdIds[0] ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: djQueueItems.id });
      if (!row) return;
      added.push(row.id);
      await tx
        .insert(djVotes)
        .values(entry.householdIds.map((householdId) => ({ itemId: row.id, householdId, kind: "up" as const })))
        .onConflictDoNothing();
    });
  }
  fillCoversLater(added);
  return added.length;
}

/**
 * Say by hand what is on air: the planner's way round a bridge that cannot
 * read djay's decks. Exactly what the bridge's own report would do.
 */
export async function markOnAir(itemId: number | null): Promise<void> {
  if (itemId === null) {
    await recordOnAir(null);
    return;
  }
  const [row] = await db
    .select({ title: djQueueItems.title, artist: djQueueItems.artist })
    .from(djQueueItems)
    .where(eq(djQueueItems.id, itemId))
    .limit(1);
  if (row) await recordOnAir(row);
}

// ---------------------------------------------------------------------------
// The bridge.

export function isBridgeConfigured(): boolean {
  return (process.env.DJ_BRIDGE_TOKEN ?? "") !== "";
}

export function verifyBridgeToken(authorization: string | null): boolean {
  return verifyBearerToken(authorization, process.env.DJ_BRIDGE_TOKEN);
}

/** Polled every few seconds; much longer than this and the laptop has gone. */
const BRIDGE_FRESH_MS = 30 * 1000;

/** Whether the laptop is still checking in, and how long since it last did. */
export function bridgeHealth(
  floor: Pick<FloorSettings, "bridgeSeenAt">,
  now: Date = new Date(),
): { live: boolean; agoMs: number | null } {
  if (floor.bridgeSeenAt === null) return { live: false, agoMs: null };
  const agoMs = Math.max(0, now.getTime() - floor.bridgeSeenAt.getTime());
  return { live: agoMs < BRIDGE_FRESH_MS, agoMs };
}

export type BridgeSong = { id: number; title: string; artist: string | null };

/** Everything the bridge needs to know on each poll. */
export type BridgeInstructions = {
  /** Load this onto djay's idle deck, then report `cued` or `cue_failed`. */
  cue: BridgeSong | null;
  /** Press Skip: this is on air and has been voted (or asked) off. */
  skip: BridgeSong | null;
  /** What the app believes is on air, so the bridge can tell when it changed. */
  onAir: BridgeSong | null;
};

const asSong = (row: QueueItem): BridgeSong => ({
  id: row.id,
  title: row.title,
  artist: row.artist,
});

/**
 * Work out what the bridge should do, and record that it asked - the
 * planner shows when the laptop was last heard from. A cue that has
 * evidently not landed is dropped first (`staleCues`), so the next
 * request is not held up behind it.
 */
export async function bridgeInstructions(): Promise<BridgeInstructions> {
  const now = new Date();
  await updateFloor({ bridgeSeenAt: now });

  let { items, votes } = await loadQueue(now);
  const stale = staleCues(items);
  if (stale.length > 0) {
    for (const id of stale) {
      await db
        .update(djQueueItems)
        .set({
          status: "unavailable",
          note: "djay was given this but two other songs have played since",
          endedAt: now,
        })
        .where(and(eq(djQueueItems.id, id), eq(djQueueItems.status, "cued")));
    }
    ({ items, votes } = await loadQueue(now));
  }

  const floor = await getFloor();
  const skipVotes = tally(votes, "skip");
  const playing = items.find((item) => item.status === "playing") ?? null;
  const next = nextToCue(items, votes);

  return {
    cue: next ? asSong(next) : null,
    skip:
      playing && shouldSkip(playing, skipVotes.get(playing.id) ?? 0, floor.skipVotesNeeded)
        ? asSong(playing)
        : null,
    onAir: playing ? asSong(playing) : null,
  };
}
