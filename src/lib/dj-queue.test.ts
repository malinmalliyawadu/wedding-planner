import { describe, expect, it } from "vitest";
import {
  CUE_DEPTH,
  MAX_WAITING_PER_HOUSEHOLD,
  QUEUE_STATUSES,
  REPLAY_GAP_MS,
  checkRequest,
  nextToCue,
  planOnAir,
  removal,
  shouldSkip,
  staleCues,
  tally,
  transition,
  upcoming,
  type QueueEvent,
  type QueueItem,
  type Vote,
} from "./dj-queue";
import { songKey } from "./songs";

const T0 = new Date("2027-03-20T08:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60 * 1000);

let nextId = 1;
function item(overrides: Partial<QueueItem> & { title: string; artist?: string | null }): QueueItem {
  const artist = overrides.artist ?? null;
  return {
    id: nextId++,
    householdId: 1,
    status: "queued",
    skipRequested: false,
    createdAt: T0,
    cuedAt: null,
    startedAt: null,
    endedAt: null,
    songKey: songKey(overrides.title, artist),
    ...overrides,
    artist,
  };
}

const up = (itemId: number, householdId: number): Vote => ({ itemId, householdId, kind: "up" });
const skip = (itemId: number, householdId: number): Vote => ({ itemId, householdId, kind: "skip" });

describe("upcoming", () => {
  it("puts the most wanted first, then the first asked", () => {
    const early = item({ title: "September", artist: "Earth, Wind & Fire", createdAt: minutes(0) });
    const late = item({ title: "Valerie", artist: "Amy Winehouse", createdAt: minutes(5) });
    const loved = item({ title: "Dancing Queen", artist: "ABBA", createdAt: minutes(9) });
    const order = upcoming(
      [late, loved, early],
      [up(loved.id, 1), up(loved.id, 2), up(early.id, 3), up(late.id, 4)],
    );
    expect(order.map((i) => i.title)).toEqual(["Dancing Queen", "September", "Valerie"]);
    expect(order[0].upVotes).toBe(2);
  });

  it("only lists what is still the app's to order", () => {
    const statuses = QUEUE_STATUSES.map((status) => item({ title: `Song ${status}`, status }));
    expect(upcoming(statuses, []).map((i) => i.status)).toEqual(["queued"]);
  });

  it("ignores skip votes when ordering", () => {
    const a = item({ title: "A", createdAt: minutes(0) });
    const b = item({ title: "B", createdAt: minutes(1) });
    expect(upcoming([a, b], [skip(b.id, 1), skip(b.id, 2)])[0].id).toBe(a.id);
  });
});

describe("tally", () => {
  it("counts one kind of vote per item", () => {
    const counts = tally([up(1, 1), up(1, 2), skip(1, 3), up(2, 1)], "up");
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(tally([up(1, 1)], "skip").size).toBe(0);
  });
});

describe("checkRequest", () => {
  it("lets a fresh song through", () => {
    expect(checkRequest(songKey("Valerie", "Amy Winehouse"), 1, [], T0)).toEqual({ ok: true });
  });

  it("refuses a song already waiting, cued or on air, whoever asked", () => {
    for (const status of ["queued", "cued", "playing"] as const) {
      const existing = item({ title: "Valerie", artist: "Amy Winehouse", status, householdId: 7 });
      // The same song spelled differently is the same song.
      expect(checkRequest(songKey("valerie (live)", "amy winehouse"), 1, [existing], T0)).toEqual({
        ok: false,
        reason: "already_queued",
      });
    }
  });

  it("keeps a song off the menu for a while after it was on", () => {
    for (const status of ["played", "skipped"] as const) {
      const done = item({ title: "Mr Brightside", status, endedAt: T0 });
      const key = done.songKey;
      expect(checkRequest(key, 1, [done], minutes(30))).toEqual({ ok: false, reason: "just_played" });
      expect(checkRequest(key, 1, [done], new Date(T0.getTime() + REPLAY_GAP_MS))).toEqual({ ok: true });
    }
  });

  it("does not hold a removed or unavailable song against anyone", () => {
    for (const status of ["removed", "unavailable"] as const) {
      const gone = item({ title: "Wonderwall", status, endedAt: T0 });
      expect(checkRequest(gone.songKey, 1, [gone], minutes(1))).toEqual({ ok: true });
    }
  });

  it("caps how many songs one household has waiting", () => {
    const mine = Array.from({ length: MAX_WAITING_PER_HOUSEHOLD }, (_, i) =>
      item({ title: `Mine ${i}`, householdId: 3 }),
    );
    const key = songKey("One more", null);
    expect(checkRequest(key, 3, mine, T0)).toEqual({ ok: false, reason: "household_limit" });
    // Another household is not affected.
    expect(checkRequest(key, 4, mine, T0)).toEqual({ ok: true });
  });

  it("gives a slot back once djay has the song", () => {
    const mine = Array.from({ length: MAX_WAITING_PER_HOUSEHOLD }, (_, i) =>
      item({ title: `Mine ${i}`, householdId: 3, status: i === 0 ? "cued" : "queued" }),
    );
    expect(checkRequest(songKey("One more", null), 3, mine, T0)).toEqual({ ok: true });
  });

  it("gives a slot back, and the song, when djay could not be given it", () => {
    const mine = Array.from({ length: MAX_WAITING_PER_HOUSEHOLD }, (_, i) =>
      item({ title: `Mine ${i}`, householdId: 3, status: i === 0 ? "unavailable" : "queued" }),
    );
    expect(checkRequest(songKey("One more", null), 3, mine, T0)).toEqual({ ok: true });
    // Asking again for the one that failed is allowed straight away.
    expect(checkRequest(mine[0].songKey, 3, mine, T0)).toEqual({ ok: true });
  });
});

describe("shouldSkip", () => {
  it("skips once enough households have voted", () => {
    const playing = { status: "playing" as const, skipRequested: false };
    expect(shouldSkip(playing, 4, 5)).toBe(false);
    expect(shouldSkip(playing, 5, 5)).toBe(true);
  });

  it("skips when the couple asked, whatever the votes", () => {
    expect(shouldSkip({ status: "playing", skipRequested: true }, 0, 5)).toBe(true);
  });

  it("never skips something that is not on air", () => {
    for (const status of QUEUE_STATUSES.filter((s) => s !== "playing")) {
      expect(shouldSkip({ status, skipRequested: true }, 99, 1)).toBe(false);
    }
  });

  it("treats a threshold below one as one, so no song is skipped on zero votes", () => {
    const playing = { status: "playing" as const, skipRequested: false };
    expect(shouldSkip(playing, 0, 0)).toBe(false);
    expect(shouldSkip(playing, 1, 0)).toBe(true);
  });
});

describe("nextToCue", () => {
  it("hands djay the top of the list", () => {
    const a = item({ title: "A", createdAt: minutes(0) });
    const b = item({ title: "B", createdAt: minutes(1) });
    expect(nextToCue([a, b], [up(b.id, 1)])?.id).toBe(b.id);
  });

  it("waits while djay is already holding enough", () => {
    const held = Array.from({ length: CUE_DEPTH }, (_, i) => item({ title: `Held ${i}`, status: "cued" }));
    const waiting = item({ title: "Waiting" });
    expect(nextToCue([...held, waiting], [])).toBeNull();
  });

  it("moves on past a song djay could not be given", () => {
    const failed = item({ title: "Obscure B-side", status: "unavailable" });
    const waiting = item({ title: "Waiting" });
    expect(nextToCue([failed, waiting], [])?.id).toBe(waiting.id);
  });

  it("has nothing to cue when nothing is waiting", () => {
    expect(nextToCue([item({ title: "On", status: "playing" })], [])).toBeNull();
  });
});

describe("transition", () => {
  const cases: [string, QueueEvent, string | null][] = [
    ["queued", "cued", "cued"],
    ["playing", "cued", null],
    ["queued", "cue_failed", "unavailable"],
    ["cued", "cue_failed", null],
    ["cued", "started", "playing"],
    ["queued", "started", "playing"],
    ["played", "started", null],
    ["skipped", "started", null],
    ["removed", "started", null],
    ["playing", "ended", "played"],
    ["cued", "ended", null],
    ["queued", "removed", "removed"],
    ["cued", "removed", null],
    ["playing", "removed", null],
  ];
  it.each(cases)("%s --%s--> %s", (from, event, to) => {
    expect(transition(from as QueueItem["status"], event)).toBe(to);
  });

  it("never revives a finished song", () => {
    const events: QueueEvent[] = ["cued", "cue_failed", "started", "ended", "removed"];
    for (const status of ["played", "skipped", "removed", "unavailable"] as const) {
      for (const event of events) expect(transition(status, event)).toBeNull();
    }
  });
});

describe("removal", () => {
  it("takes a request off the list while it is still the app's", () => {
    expect(removal("queued")).toBe("remove");
  });

  it("skips a song djay already holds when it comes on", () => {
    expect(removal("cued")).toBe("skip_when_on");
    expect(removal("playing")).toBe("skip_now");
  });

  it("does nothing to a song that is over", () => {
    expect(removal("played")).toBe("nothing");
  });
});

describe("planOnAir", () => {
  it("starts the cued request that has come on", () => {
    const cued = item({ title: "Valerie", artist: "Amy Winehouse", status: "cued" });
    expect(planOnAir([cued], { title: "Valerie", artist: "Amy Winehouse" })).toEqual({
      end: [],
      start: cued.id,
      create: null,
    });
  });

  it("matches by song, not by spelling", () => {
    const cued = item({ title: "Valerie", artist: "Amy Winehouse", status: "cued" });
    expect(planOnAir([cued], { title: "Valerie (Live at BBC)", artist: "amy winehouse" }).start).toBe(cued.id);
  });

  it("ends what was playing when something else comes on", () => {
    const was = item({ title: "September", status: "playing" });
    const cued = item({ title: "Valerie", artist: "Amy Winehouse", status: "cued" });
    expect(planOnAir([was, cued], { title: "Valerie", artist: "Amy Winehouse" })).toEqual({
      end: [{ id: was.id, status: "played" }],
      start: cued.id,
      create: null,
    });
  });

  it("records a song the couple skipped as skipped", () => {
    const was = item({ title: "Macarena", status: "playing", skipRequested: true });
    expect(planOnAir([was], { title: "Next", artist: null }).end).toEqual([{ id: was.id, status: "skipped" }]);
  });

  it("records a song the guests voted off as skipped", () => {
    const was = item({ title: "Macarena", status: "playing" });
    expect(planOnAir([was], { title: "Next", artist: null }, new Set([was.id])).end).toEqual([
      { id: was.id, status: "skipped" },
    ]);
  });

  it("leaves a song alone while it is still on", () => {
    const on = item({ title: "Valerie", artist: "Amy Winehouse", status: "playing" });
    expect(planOnAir([on], { title: "Valerie", artist: "Amy Winehouse" })).toEqual({
      end: [],
      start: null,
      create: null,
    });
  });

  it("takes a song the DJ chose themselves onto the list", () => {
    const queued = item({ title: "Something else" });
    expect(planOnAir([queued], { title: "  Shout ", artist: "The Isley Brothers" })).toEqual({
      end: [],
      start: null,
      create: { title: "Shout", artist: "The Isley Brothers" },
    });
  });

  it("counts a requested song the DJ played early as the request", () => {
    const queued = item({ title: "Shout", artist: "The Isley Brothers" });
    expect(planOnAir([queued], { title: "Shout", artist: "The Isley Brothers" }).start).toBe(queued.id);
  });

  it("prefers the request djay was given over a duplicate key elsewhere", () => {
    // Cannot happen with the unique index, but the choice should still be the cued one.
    const queued = item({ title: "Shout", status: "queued" });
    const cued = item({ title: "Shout", status: "cued" });
    expect(planOnAir([queued, cued], { title: "Shout", artist: null }).start).toBe(cued.id);
  });

  it("ends everything when nothing is on air", () => {
    const was = item({ title: "Last dance", status: "playing" });
    expect(planOnAir([was], null)).toEqual({ end: [{ id: was.id, status: "played" }], start: null, create: null });
    expect(planOnAir([was], { title: "   ", artist: null }).end).toHaveLength(1);
  });
});

describe("staleCues", () => {
  it("leaves a cue alone while the song before it plays", () => {
    const before = item({ title: "On now", status: "playing", startedAt: minutes(0) });
    const cued = item({ title: "Next", status: "cued", cuedAt: minutes(1) });
    expect(staleCues([before, cued])).toEqual([]);
  });

  it("allows one song to come on first, for a mix djay had already lined up", () => {
    const cued = item({ title: "Next", status: "cued", cuedAt: minutes(1) });
    const lined = item({ title: "Lined up", status: "playing", startedAt: minutes(3) });
    expect(staleCues([cued, lined])).toEqual([]);
  });

  it("gives up on a cue once two songs have started after it", () => {
    const cued = item({ title: "Next", status: "cued", cuedAt: minutes(1) });
    const a = item({ title: "A", status: "played", startedAt: minutes(3), endedAt: minutes(6) });
    const b = item({ title: "B", status: "playing", startedAt: minutes(6) });
    expect(staleCues([cued, a, b])).toEqual([cued.id]);
  });

  it("does not count time, only songs", () => {
    // An hour of speeches with nothing on air is not a failed cue.
    const cued = item({ title: "Next", status: "cued", cuedAt: minutes(1) });
    const before = item({ title: "Before", status: "played", startedAt: minutes(0), endedAt: minutes(2) });
    expect(staleCues([cued, before])).toEqual([]);
  });

  it("only looks at songs that are still cued", () => {
    const done = item({ title: "Done", status: "played", cuedAt: minutes(0), startedAt: minutes(1) });
    const a = item({ title: "A", status: "played", startedAt: minutes(3) });
    const b = item({ title: "B", status: "playing", startedAt: minutes(6) });
    expect(staleCues([done, a, b])).toEqual([]);
  });
});
