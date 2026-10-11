import { cleanSongText, songKey } from "./songs";

/**
 * The dance floor's request queue, the pure half.
 *
 * Guests add songs from their phones, vote the ones they want up the
 * list, and vote to skip what is playing. djay Pro does the playing, on
 * a Mac at the venue, and a small bridge script on that Mac is the only
 * thing that talks to it (`bridge/dj/`). Everything that decides what
 * happens next - which request goes to djay, whether a song has been
 * voted off, what a report from the bridge means - is in here, so the
 * guests' page, the couple's page and the bridge's endpoint cannot
 * disagree about it.
 *
 * Nothing here touches the network or the database.
 */

/**
 * Where a request is in its life.
 *
 * - `queued`: waiting in the app; votes still move it.
 * - `cued`: loaded onto djay's idle deck, to play next. Its place is djay's now.
 * - `playing`: what the bridge last saw on air.
 * - `played`, `skipped`, `removed`, `unavailable`: over. `unavailable`
 *   is a request djay could not be given; it is simply dropped, and
 *   anyone who still wants it asks again.
 */
export const QUEUE_STATUSES = [
  "queued",
  "cued",
  "playing",
  "played",
  "skipped",
  "removed",
  "unavailable",
] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

/** Statuses a song can only hold once at a time - see the unique index. */
export const ACTIVE_STATUSES = [
  "queued",
  "cued",
  "playing",
] as const satisfies readonly QueueStatus[];

export function isActive(status: QueueStatus): boolean {
  return (ACTIVE_STATUSES as readonly QueueStatus[]).includes(status);
}

/**
 * Songs one household may have waiting at once. Two, so one table cannot
 * fill the night; a slot comes back as soon as djay has the song.
 */
export const MAX_WAITING_PER_HOUSEHOLD = 2;

/**
 * How long a song is off the menu after it was on. Without it the
 * wedding hears "Mr Brightside" every forty minutes, and a song the
 * floor voted off comes straight back.
 */
export const REPLAY_GAP_MS = 90 * 60 * 1000;

/** Households that must vote before a song is skipped, unless the couple change it. */
export const DEFAULT_SKIP_VOTES_NEEDED = 5;

/**
 * How many requests djay holds at once. One, and it has to be: a request
 * is cued by loading it onto the idle deck, which holds exactly one song,
 * so a second would replace the first. Every other request stays in the
 * app where votes can still move it.
 */
export const CUE_DEPTH = 1;

export type QueueItem = {
  id: number;
  title: string;
  artist: string | null;
  songKey: string;
  /** Null when the couple added it, or the DJ played it off their own bat. */
  householdId: number | null;
  status: QueueStatus;
  /** The couple pressed skip, or removed it after djay already had it. */
  skipRequested: boolean;
  createdAt: Date;
  cuedAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
};

export type VoteKind = "up" | "skip";
export type Vote = { itemId: number; householdId: number; kind: VoteKind };

/** Votes of one kind, by item. */
export function tally(votes: readonly Vote[], kind: VoteKind): Map<number, number> {
  const counts = new Map<number, number>();
  for (const vote of votes) {
    if (vote.kind !== kind) continue;
    counts.set(vote.itemId, (counts.get(vote.itemId) ?? 0) + 1);
  }
  return counts;
}

export type RankedItem<I extends QueueItem = QueueItem> = I & { upVotes: number };

/**
 * What is waiting, in the order it will go to djay: most wanted first,
 * then first asked. Requesting a song counts as its household's vote for
 * it, so a fresh request starts on one, not zero.
 */
export function upcoming<I extends QueueItem>(
  items: readonly I[],
  votes: readonly Vote[],
): RankedItem<I>[] {
  const ups = tally(votes, "up");
  return items
    .filter((item) => item.status === "queued")
    .map((item) => ({ ...item, upVotes: ups.get(item.id) ?? 0 }))
    .sort(
      (a, b) =>
        b.upVotes - a.upVotes ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id - b.id,
    );
}

export type RequestRefusal = "already_queued" | "just_played" | "household_limit";

/**
 * Whether a household may add this song now. The database's unique index
 * on active song keys is the real lock on duplicates; this is what lets
 * the page say why before anyone presses anything.
 */
export function checkRequest(
  key: string,
  householdId: number,
  items: readonly QueueItem[],
  now: Date,
): { ok: true } | { ok: false; reason: RequestRefusal } {
  for (const item of items) {
    if (item.songKey !== key) continue;
    if (isActive(item.status)) return { ok: false, reason: "already_queued" };
    if (
      (item.status === "played" || item.status === "skipped") &&
      item.endedAt !== null &&
      now.getTime() - item.endedAt.getTime() < REPLAY_GAP_MS
    ) {
      return { ok: false, reason: "just_played" };
    }
  }
  const waiting = items.filter(
    (item) => item.householdId === householdId && item.status === "queued",
  ).length;
  if (waiting >= MAX_WAITING_PER_HOUSEHOLD) {
    return { ok: false, reason: "household_limit" };
  }
  return { ok: true };
}

/** Whether the bridge should press Skip on this item. */
export function shouldSkip(
  item: Pick<QueueItem, "status" | "skipRequested">,
  skipVotes: number,
  skipVotesNeeded: number,
): boolean {
  if (item.status !== "playing") return false;
  return item.skipRequested || skipVotes >= Math.max(1, skipVotesNeeded);
}

/**
 * The request the bridge should hand djay next, or null when djay is
 * already holding enough.
 */
export function nextToCue<I extends QueueItem>(
  items: readonly I[],
  votes: readonly Vote[],
  depth: number = CUE_DEPTH,
): RankedItem<I> | null {
  const held = items.filter((item) => item.status === "cued").length;
  if (held >= depth) return null;
  return upcoming(items, votes)[0] ?? null;
}

/**
 * Something that happens to a request. The bridge causes the first three;
 * the couple cause `removed`. Going on air and coming off it are not
 * events the bridge sends one by one - see `planOnAir`.
 */
export type QueueEvent = "cued" | "cue_failed" | "started" | "ended" | "removed";

/**
 * Where an event takes a request, or null when it cannot happen from
 * there. A late or repeated report from the bridge is therefore ignored
 * rather than dragging a finished song back to life.
 *
 * `cue_failed` drops the request rather than holding it for someone to
 * hunt for: whoever wanted it can ask again, and nothing waits behind it.
 *
 * `started` is allowed from any waiting status, because the DJ is a
 * person and may simply play a requested song from djay's own library
 * before the bridge got to it. That counts.
 */
export function transition(
  status: QueueStatus,
  event: QueueEvent,
): QueueStatus | null {
  switch (event) {
    case "cued":
      return status === "queued" ? "cued" : null;
    case "cue_failed":
      return status === "queued" ? "unavailable" : null;
    case "started":
      return status === "queued" || status === "cued" ? "playing" : null;
    case "ended":
      return status === "playing" ? "played" : null;
    case "removed":
      // A cued song is on djay's deck, where the app cannot reach in and
      // take it out; it is skipped when it comes on instead (`removal`).
      return status === "queued" ? "removed" : null;
  }
}

/**
 * What removing a request does: takes it off the list if it is still the
 * app's, or marks it to be skipped the moment it plays if djay already
 * has it - or is already playing it.
 */
export function removal(
  status: QueueStatus,
): "remove" | "skip_when_on" | "skip_now" | "nothing" {
  if (transition(status, "removed") !== null) return "remove";
  if (status === "cued") return "skip_when_on";
  if (status === "playing") return "skip_now";
  return "nothing";
}

/**
 * Songs djay was given that have evidently not landed in its queue.
 *
 * The bridge drives djay by keystrokes, and a keystroke cannot tell you
 * whether it worked: a search that found nothing, or a dialog that took
 * focus, looks exactly like success from outside. Left alone, a song
 * like that would sit "cued" for the rest of the night, and since djay
 * only ever holds one request, nothing else would ever be handed over.
 *
 * So the room is the check. With one request held, the first song to
 * start after it was cued should be it; allow one more for a crossfade
 * djay had already lined up before the bridge got there. Two songs
 * starting after it and still no sign of it means it is not coming, and
 * it is dropped as `unavailable`, the same as a cue that failed outright,
 * so the next request can go. If it was on a deck after all and comes
 * on, `planOnAir` adds it back as the DJ's own choice.
 *
 * Counted in songs rather than minutes on purpose: half an hour of
 * speeches with the music down is not evidence of anything.
 */
export const STALE_AFTER_SONGS = 2;

export function staleCues(items: readonly QueueItem[]): number[] {
  return items
    .filter((item) => item.status === "cued" && item.cuedAt !== null)
    .filter(
      (cued) =>
        items.filter(
          (other) =>
            other.id !== cued.id &&
            other.startedAt !== null &&
            other.startedAt.getTime() > cued.cuedAt!.getTime(),
        ).length >= STALE_AFTER_SONGS,
    )
    .map((item) => item.id);
}

/** A song the bridge read off djay's decks. */
export type OnAir = { title: string; artist: string | null };

export type OnAirPlan = {
  /** Items to take off air, with how they ended. */
  end: { id: number; status: "played" | "skipped" }[];
  /** An existing request that has come on. */
  start: number | null;
  /** A song nobody requested that has come on: the DJ's own choice. */
  create: OnAir | null;
};

/**
 * Turn "this is what is on air now" into changes to the queue.
 *
 * The bridge reports what it sees rather than what it did, because what
 * it sees is the truth: the DJ can override anything from the laptop, and
 * the queue should follow the room rather than argue with it. So a song
 * that comes on is matched to a request by `songKey` - the same rule that
 * stops it being requested twice - and whatever was playing before it
 * has ended. It ended `skipped` if the couple asked for a skip or the
 * floor voted it off, otherwise `played`; the bridge pressing Skip and the song changing are one fact.
 *
 * `null` means nothing is on air. A song that is still on air is left
 * exactly as it is.
 */
export function planOnAir(
  items: readonly QueueItem[],
  seen: OnAir | null,
  /** Items the floor has voted off (`shouldSkip` on the votes). */
  votedOff: ReadonlySet<number> = new Set(),
): OnAirPlan {
  const clean: OnAir | null =
    seen === null || cleanSongText(seen.title) === ""
      ? null
      : { title: cleanSongText(seen.title), artist: cleanSongText(seen.artist) || null };
  const key = clean ? songKey(clean.title, clean.artist) : null;

  const playing = items.filter((item) => item.status === "playing");
  const stillOn = key === null ? undefined : playing.find((item) => item.songKey === key);

  const end = playing
    .filter((item) => item !== stillOn)
    .map((item) => ({
      id: item.id,
      status:
        item.skipRequested || votedOff.has(item.id) ? ("skipped" as const) : ("played" as const),
    }));

  if (clean === null || key === null || stillOn) {
    return { end, start: null, create: null };
  }

  // Prefer what djay was given; then anything else of ours with that key.
  const preference: QueueStatus[] = ["cued", "queued"];
  for (const status of preference) {
    const match = items.find((item) => item.status === status && item.songKey === key);
    if (match) return { end, start: match.id, create: null };
  }
  return { end, start: null, create: clean };
}

/** What a guest is told when a request is turned away. */
export function describeRefusal(reason: RequestRefusal): string {
  switch (reason) {
    case "already_queued":
      return "That one is already on the list - give it a vote instead.";
    case "just_played":
      return "That one has had its turn tonight. Try again later.";
    case "household_limit":
      return `You have ${MAX_WAITING_PER_HOUSEHOLD} songs waiting already. Once one is up, add another.`;
  }
}
