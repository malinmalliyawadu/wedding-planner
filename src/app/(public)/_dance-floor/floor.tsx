"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Disc3, Search, SkipForward } from "lucide-react";
import type { DanceFloor, DanceFloorState, FloorSong } from "@/lib/public/queries";
import { songKey } from "@/lib/songs";
import type { FloorActionResult, FloorSongInput } from "./action-results";
import { MirrorBall, Room } from "./mirror-ball";
import { SearchSheet, type QueuedState } from "./search-sheet";

/**
 * The live half of the dance floor, shared by both ways in: a household's
 * invitation link and the QR code at the venue. The page hands it where
 * to poll, where to search and the two actions, already bound to whichever
 * credential brought the guest here.
 *
 * Polls every few seconds while the page is in front of the guest - not
 * while the phone is in a pocket - and straight after each of their own
 * taps. Their taps land on screen at once (`useOptimistic`) and are
 * squared with the room when the server answers, because marquee wifi
 * makes a round trip long enough to feel.
 */

const POLL_MS = 5000;
/** Missed polls in a row before the page admits it has lost the room. */
const LOST_AFTER = 2;
const TOAST_MS = 3600;

type Connection = "live" | "lost" | "gone";

type Patch =
  | { type: "up"; id: number; on: boolean }
  | { type: "skip"; id: number; on: boolean }
  | { type: "request"; song: FloorSongInput; tempId: number };

/**
 * A tap, applied ahead of the server. Each is written to be harmless if
 * the server has already counted it, since a poll can land mid-flight.
 */
function applyPatch(state: DanceFloorState, patch: Patch): DanceFloorState {
  if (!state.open) return state;
  switch (patch.type) {
    case "up":
      return {
        ...state,
        upNext: state.upNext.map((song) =>
          song.id === patch.id && song.stage === "waiting" && song.votedUp !== patch.on
            ? { ...song, votedUp: patch.on, upVotes: Math.max(0, song.upVotes + (patch.on ? 1 : -1)) }
            : song,
        ),
      };
    case "skip": {
      const on = state.nowPlaying;
      if (!on || on.id !== patch.id || on.votedSkip === patch.on) return state;
      return {
        ...state,
        nowPlaying: { ...on, votedSkip: patch.on, skipVotes: Math.max(0, on.skipVotes + (patch.on ? 1 : -1)) },
      };
    }
    case "request": {
      const key = songKey(patch.song.title, patch.song.artist);
      const listed =
        state.upNext.some((song) => songKey(song.title, song.artist) === key) ||
        (state.nowPlaying && songKey(state.nowPlaying.title, state.nowPlaying.artist) === key);
      if (listed) return state;
      return {
        ...state,
        yourWaiting: state.yourWaiting + 1,
        upNext: [
          ...state.upNext,
          {
            id: patch.tempId,
            title: patch.song.title,
            artist: patch.song.artist,
            upVotes: 1,
            votedUp: true,
            mine: true,
            coverUrl: null,
            stage: "waiting",
          },
        ],
      };
    }
  }
}

function buzz() {
  // Android only; iOS Safari has no vibration, and that is fine.
  navigator.vibrate?.(8);
}

export function Floor({
  couple,
  initial,
  statePath,
  searchPath,
  request,
  vote,
  invitationHref,
  goneHint,
}: {
  couple: { a: string; b: string };
  initial: DanceFloorState;
  statePath: string;
  searchPath: string;
  request: (song: FloorSongInput) => Promise<FloorActionResult>;
  vote: (itemId: number, kind: "up" | "skip", on: boolean) => Promise<FloorActionResult>;
  /** Back to the guest's own invitation, when they came in by it. */
  invitationHref?: string;
  /** What to do when the link stops working. */
  goneHint: string;
}) {
  const [floor, setFloor] = useState<DanceFloorState>(initial);
  const [connection, setConnection] = useState<Connection>("live");
  const [view, addPatch] = useOptimistic(floor, applyPatch);
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<{ id: number; text: string; tone: "ok" | "no" } | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const misses = useRef(0);
  /** The first poll, which is what hands a QR-code phone its cookie. */
  const firstPoll = useRef<Promise<void> | null>(null);
  const tempIds = useRef(-1);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(statePath, { cache: "no-store" });
      if (response.status === 404) {
        setConnection("gone");
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      setFloor((await response.json()) as DanceFloorState);
      misses.current = 0;
      setConnection("live");
    } catch {
      // One dropped poll on marquee wifi is not worth a word; a few are.
      misses.current += 1;
      if (misses.current >= LOST_AFTER) setConnection((now) => (now === "gone" ? now : "lost"));
    }
  }, [statePath]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    // Straight away as well as on the beat: this is also what gives a
    // phone from the QR code its cookie, before it taps anything.
    const first = setTimeout(() => {
      firstPoll.current ??= refresh();
    }, 0);
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [refresh]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((text: string, tone: "ok" | "no" = "ok") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, tone });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  function run(patch: Patch, action: () => Promise<FloorActionResult>, success?: string) {
    buzz();
    startTransition(async () => {
      addPatch(patch);
      // A tap that beat the first poll would reach the server with no
      // cookie, be given one of its own, and race the poll's for which
      // the phone keeps - leaving this vote with an identity it has
      // lost. So it waits for the poll, which is long since back by the
      // time anyone has read the page.
      await (firstPoll.current ??= refresh());
      const result = await action();
      if (!result.ok) say(result.message, "no");
      else if (success) say(success);
      await refresh();
    });
  }

  function openSearch() {
    // Focused in the same tap that opened it, or iOS will not raise the keyboard.
    sheetRef.current?.showModal();
    searchRef.current?.focus();
  }

  function pick(song: FloorSongInput) {
    sheetRef.current?.close();
    if (!view.open) return;
    const key = songKey(song.title, song.artist);
    const on = view.nowPlaying && songKey(view.nowPlaying.title, view.nowPlaying.artist) === key;
    const listed = view.upNext.find((s) => songKey(s.title, s.artist) === key);
    setFlashKey(key);
    // Already on the list: asking again is a vote for it, which is what
    // the guest meant.
    if (on) {
      say("That one is playing right now.");
    } else if (listed) {
      if (listed.stage === "waiting" && !listed.votedUp) {
        run({ type: "up", id: listed.id, on: true }, () => vote(listed.id, "up", true), "It was already on the list - your vote is in.");
      } else {
        say(listed.stage === "next" ? "That one is playing next." : "You have already voted for that one.");
      }
    } else {
      run(
        { type: "request", song, tempId: tempIds.current-- },
        () => request(song),
        `“${song.title}” is on the list.`,
      );
    }
  }

  const queued = new Map<string, QueuedState>();
  if (view.open) {
    for (const song of view.upNext) {
      queued.set(songKey(song.title, song.artist), {
        stage: song.stage,
        votedUp: song.votedUp,
      });
    }
    if (view.nowPlaying) {
      queued.set(songKey(view.nowPlaying.title, view.nowPlaying.artist), { stage: "playing", votedUp: false });
    }
  }

  const live = connection === "gone" ? null : view.open ? view : null;

  return (
    <>
      <Room coverUrl={live?.nowPlaying?.coverSmallUrl ?? null} />

      <header className="mx-auto flex w-full max-w-[30rem] items-center justify-between gap-4 px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-1">
        <h1 className="font-display text-[1.125rem] leading-none">
          {couple.a} <span className="font-amp text-[1.2em] italic">&amp;</span> {couple.b}
          <span className="sr-only">: the dance floor</span>
        </h1>
        <LiveBadge connection={connection} open={floor.open} />
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-[30rem] px-5 pb-[calc(env(safe-area-inset-bottom)+9.5rem)]"
      >
        {connection === "gone" ? (
          <Empty title="This link has stopped working" detail={goneHint} />
        ) : !floor.open ? (
          <Empty
            title="Requests open when the dancing starts"
            detail="Keep this page open - it will open by itself."
          />
        ) : (
          view.open && (
            <>
              <NowPlaying
                floor={view}
                onSkip={(id, on) => run({ type: "skip", id, on }, () => vote(id, "skip", on))}
              />
              <UpNext
                songs={view.upNext}
                flashKey={flashKey}
                onFlashed={() => setFlashKey(null)}
                onVote={(id, on) => run({ type: "up", id, on }, () => vote(id, "up", on))}
              />
              <HowItWorks floor={view} />
            </>
          )
        )}

        {invitationHref && (
          <p className="mt-10 text-center">
            <Link
              href={invitationHref}
              className="inline-flex min-h-11 items-center px-3 text-[0.9375rem] text-(--moon-soft) underline decoration-(--line-strong) underline-offset-4 transition-colors hover:text-(--moon)"
            >
              Back to your invitation
            </Link>
          </p>
        )}
      </main>

      {live && (
        <RequestBar floor={live} onOpen={openSearch} />
      )}

      <Toast toast={toast} />

      <SearchSheet
        sheetRef={sheetRef}
        inputRef={searchRef}
        searchPath={searchPath}
        queued={queued}
        onPick={pick}
      />
    </>
  );
}

function LiveBadge({ connection, open }: { connection: Connection; open: boolean }) {
  const state = connection !== "live" ? "lost" : open ? "live" : "waiting";
  const label =
    connection === "gone" ? "Closed" : connection === "lost" ? "Reconnecting…" : open ? "Live" : "Waiting";
  return (
    <p role="status" className="flex items-center gap-2 text-[0.8125rem] font-medium text-(--moon-soft)">
      <span className="dance-live-dot" data-state={state} aria-hidden />
      {label}
    </p>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="pt-6 text-center">
      <MirrorBall className="mx-auto aspect-square w-[min(100%,34dvh,18rem)]" />
      <h2 className="dance-display mt-6 text-[clamp(2.25rem,10vw,3rem)] leading-[0.95] text-balance">{title}</h2>
      <p className="mx-auto mt-3 max-w-[22rem] text-[1.0625rem] leading-relaxed text-(--moon-soft)">{detail}</p>
    </section>
  );
}

function NowPlaying({
  floor,
  onSkip,
}: {
  floor: DanceFloor;
  onSkip: (id: number, on: boolean) => void;
}) {
  const song = floor.nowPlaying;
  const announced = useRef<number | null>(song?.id ?? null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!song || song.id === announced.current) return;
    announced.current = song.id;
    setAnnouncement(`Now playing: ${song.title}${song.artist ? ` by ${song.artist}` : ""}`);
  }, [song]);

  return (
    <section aria-labelledby="dance-now" className="pt-5 text-center">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="relative mx-auto aspect-square w-[min(100%,36dvh,20rem)]">
        {song?.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the catalogue's CDN; `/_next/image` is not public
          <img
            key={song.id}
            src={song.coverUrl}
            alt=""
            width={720}
            height={720}
            decoding="async"
            fetchPriority="high"
            referrerPolicy="no-referrer"
            className="dance-cover-in size-full rounded-[1.25rem] bg-(--night-raised) object-cover shadow-[0_2rem_4rem_-1.5rem_rgb(0_0_0/0.7),0_0_0_1px_rgb(255_255_255/0.06)]"
          />
        ) : (
          <MirrorBall key={song?.id ?? "none"} className="dance-cover-in size-full" />
        )}
      </div>

      {song ? (
        <>
          <p className="mt-7 flex items-center justify-center gap-2 text-[0.875rem] font-semibold text-(--champagne)">
            <span className="dance-eq" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            {song.mine ? "Your request is playing" : "Now playing"}
          </p>
          <h2
            id="dance-now"
            className="dance-display mt-2 text-[clamp(2.5rem,12.5vw,3.5rem)] leading-[0.92] text-balance [overflow-wrap:anywhere]"
          >
            {song.title}
          </h2>
          {song.artist && (
            <p className="mt-2.5 text-[1.0625rem] text-(--moon-soft)">{song.artist}</p>
          )}
          <SkipVote
            voted={song.votedSkip}
            votes={song.skipVotes}
            needed={song.skipVotesNeeded}
            title={song.title}
            onToggle={() => onSkip(song.id, !song.votedSkip)}
          />
        </>
      ) : (
        <>
          <p className="mt-7 text-[0.875rem] font-semibold text-(--champagne)">Between songs</p>
          <h2 id="dance-now" className="dance-display mt-2 text-[clamp(2.5rem,12.5vw,3.5rem)] leading-[0.92]">
            The DJ has the floor
          </h2>
          <p className="mt-2.5 text-[1.0625rem] text-(--moon-soft)">Ask for a song and it could be next.</p>
        </>
      )}
    </section>
  );
}

function SkipVote({
  voted,
  votes,
  needed,
  title,
  onToggle,
}: {
  voted: boolean;
  votes: number;
  needed: number;
  title: string;
  onToggle: () => void;
}) {
  const shown = Math.min(votes, needed);
  return (
    <div className="mt-7 flex flex-col items-center gap-3">
      <button
        type="button"
        aria-pressed={voted}
        aria-label={voted ? `Take back your vote to skip ${title}` : `Vote to skip ${title}`}
        onClick={onToggle}
        className={`dance-press inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border px-6 text-[0.9375rem] font-semibold ${
          voted
            ? "border-(--rose)/60 bg-(--rose)/15 text-(--rose)"
            : "border-(--line-strong) bg-white/[0.04] text-(--moon) hover:bg-white/[0.08]"
        }`}
      >
        {voted ? <Check size={18} strokeWidth={2.25} aria-hidden /> : <SkipForward size={18} strokeWidth={2} aria-hidden />}
        {voted ? "You voted to skip" : "Vote to skip"}
      </button>
      <div className="flex items-center gap-3 text-[0.8125rem] text-(--moon-faint)">
        <Meter value={shown} max={needed} />
        <span>
          <span key={votes} className="dance-pop inline-block font-semibold text-(--moon-soft) tabular-nums">
            {shown}
          </span>{" "}
          of {needed} to skip
        </span>
      </div>
    </div>
  );
}

/** Pips while there are few enough to count at a glance, a bar beyond. */
function Meter({ value, max }: { value: number; max: number }) {
  if (max <= 10) {
    return (
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 w-3.5 rounded-full transition-colors duration-300 ${i < value ? "bg-(--rose)" : "bg-white/15"}`}
          />
        ))}
      </span>
    );
  }
  return (
    <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/15" aria-hidden>
      <span
        className="block h-full origin-left rounded-full bg-(--rose) transition-transform duration-300"
        style={{ transform: `scaleX(${max === 0 ? 0 : value / max})` }}
      />
    </span>
  );
}

/**
 * The list, in the order it will play. When the room's votes reorder it,
 * the rows glide to their new places rather than jumping, which is most
 * of what makes the page feel live.
 */
function UpNext({
  songs,
  flashKey,
  onFlashed,
  onVote,
}: {
  songs: FloorSong[];
  flashKey: string | null;
  onFlashed: () => void;
  onVote: (id: number, on: boolean) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const tops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    // Measured against the list, not the viewport: scrolling moves every
    // row on screen, and that is not a reorder.
    const origin = list.getBoundingClientRect().top;
    for (const row of list.querySelectorAll<HTMLElement>("[data-key]")) {
      const key = row.dataset.key!;
      const top = row.getBoundingClientRect().top - origin;
      next.set(key, top);
      const before = tops.current.get(key);
      if (!still && before !== undefined && Math.abs(before - top) > 1) {
        row.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], {
          duration: 420,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
      }
    }
    tops.current = next;
  });

  useEffect(() => {
    if (!flashKey) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(flashKey)}"]`);
    if (!row) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    const timer = setTimeout(onFlashed, 2400);
    return () => clearTimeout(timer);
  }, [flashKey, songs, onFlashed]);

  return (
    <section aria-labelledby="dance-next" className="mt-14">
      <div className="flex items-baseline justify-between border-b border-(--line) pb-3">
        <h2 id="dance-next" className="dance-display text-[2.25rem] leading-none">
          Up next
        </h2>
        {songs.length > 0 && (
          <p className="text-[0.875rem] text-(--moon-faint)">
            {songs.length} {songs.length === 1 ? "song" : "songs"}
          </p>
        )}
      </div>

      {songs.length === 0 ? (
        <div className="py-12 text-center">
          <p className="dance-display text-[1.75rem] leading-tight">Nothing asked for yet</p>
          <p className="mt-2 text-[1rem] text-(--moon-soft)">Be the first - tap Request a song below.</p>
        </div>
      ) : (
        <ol ref={listRef}>
          {songs.map((song, i) => {
            const key = songKey(song.title, song.artist);
            return (
              <li
                key={song.id < 0 ? key : song.id}
                data-key={key}
                data-flash={flashKey === key ? "" : undefined}
                // The divider is drawn inset rather than as the row's own
                // border, which would curl up into the rounded corners the
                // row needs for its "just added" glow.
                className="dance-row relative -mx-3 flex items-center gap-3.5 rounded-2xl px-3 py-3 [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:inset-x-3 [&:not(:last-child)]:after:bottom-0 [&:not(:last-child)]:after:h-px [&:not(:last-child)]:after:bg-(--line)"
              >
                <span
                  className={`dance-display w-6 shrink-0 text-center text-[1.5rem] leading-none tabular-nums ${
                    song.stage === "next" ? "text-(--champagne)" : "text-(--moon-faint)"
                  }`}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <Cover url={song.coverUrl} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[1.0625rem] leading-snug font-semibold">{song.title}</p>
                  {song.artist && (
                    <p className="truncate text-[0.875rem] text-(--moon-soft)">{song.artist}</p>
                  )}
                  {song.mine && (
                    <p className="mt-1 flex items-center gap-1.5 text-[0.75rem] font-semibold text-(--champagne)">
                      <span className="size-1.5 rounded-full bg-(--champagne)" aria-hidden />
                      Your request
                    </p>
                  )}
                </div>
                {song.stage === "next" ? (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-(--champagne)/40 px-3 py-1.5 text-[0.8125rem] font-semibold text-(--champagne)">
                    <Disc3 size={15} aria-hidden />
                    Next
                  </span>
                ) : (
                  <VoteButton song={song} onVote={onVote} />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function VoteButton({ song, onVote }: { song: FloorSong; onVote: (id: number, on: boolean) => void }) {
  const pending = song.id < 0;
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={song.votedUp}
      aria-label={`${song.votedUp ? "Take back your vote for" : "Vote for"} ${song.title}. ${song.upVotes} ${song.upVotes === 1 ? "vote" : "votes"}.`}
      onClick={() => onVote(song.id, !song.votedUp)}
      className={`dance-press flex h-14 w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl border disabled:cursor-default ${
        song.votedUp
          ? "border-transparent bg-(--champagne) text-(--on-champagne)"
          : "border-(--line-strong) bg-white/[0.04] text-(--moon) hover:bg-white/[0.08]"
      }`}
    >
      <ChevronUp size={20} strokeWidth={2.5} aria-hidden className="-mb-0.5" />
      <span key={song.upVotes} className="dance-pop text-[0.875rem] leading-none font-bold tabular-nums">
        {song.upVotes}
      </span>
    </button>
  );
}

/**
 * An album cover from the catalogue's CDN, or the drawn ball. Decorative -
 * the title beside it says what it is - and sent with no referrer, so the
 * CDN is not told which link it was loaded from. A plain `<img>`:
 * `next/image` is banned on the public pages because `/_next/image` is
 * not public.
 */
function Cover({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span className="flex size-13 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-(--night-raised)" aria-hidden>
        <MirrorBall className="size-full scale-125" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={144}
      height={144}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="size-13 shrink-0 rounded-xl bg-(--night-raised) object-cover"
    />
  );
}

function HowItWorks({ floor }: { floor: DanceFloor }) {
  return (
    <details className="group mt-10 rounded-2xl border border-(--line) bg-white/[0.03]">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">
        How requests work
        <ChevronDown size={18} aria-hidden className="text-(--moon-faint) transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <ul className="space-y-2.5 px-4 pb-4 text-[0.9375rem] leading-relaxed text-(--moon-soft)">
        <li>
          Ask for up to {floor.maxWaiting} songs at a time. Asking counts as your vote, and you get a
          slot back as soon as one is up next.
        </li>
        <li>Vote for the ones you want to hear. The most votes play first.</li>
        <li>
          Not feeling one? When {floor.skipVotesNeeded} {floor.skipVotesNeeded === 1 ? "person votes" : "people vote"}{" "}
          to skip it, the DJ moves on.
        </li>
      </ul>
    </details>
  );
}

function RequestBar({ floor, onOpen }: { floor: DanceFloor; onOpen: () => void }) {
  const full = floor.yourWaiting >= floor.maxWaiting;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-linear-to-t from-(--night) from-45% to-transparent px-4 pt-12 pb-[calc(env(safe-area-inset-bottom)+0.875rem)]">
      <div className="pointer-events-auto mx-auto max-w-[28rem]">
        {full ? (
          <p className="rounded-2xl border border-(--line-strong) bg-(--night-raised) px-4 py-3.5 text-center text-[0.9375rem] leading-snug">
            Your {floor.maxWaiting} requests are on the list.
            <span className="block text-(--moon-soft)">You can ask for another once one is up next.</span>
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={onOpen}
              className="dance-press flex h-14 w-full cursor-pointer items-center justify-center gap-2.5 rounded-full bg-(--champagne) text-[1.0625rem] font-bold text-(--on-champagne) shadow-[0_0.75rem_2rem_-0.5rem_rgb(243_217_164/0.35)] hover:brightness-105"
            >
              <Search size={20} strokeWidth={2.5} aria-hidden />
              Request a song
            </button>
            <p className="mt-2 text-center text-[0.8125rem] text-(--moon-faint)">
              {floor.yourWaiting === 0
                ? `Up to ${floor.maxWaiting} at a time`
                : `${floor.yourWaiting} of your ${floor.maxWaiting} waiting`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Toast({ toast }: { toast: { id: number; text: string; tone: "ok" | "no" } | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+7.5rem)] z-30 flex justify-center px-4"
    >
      {toast && (
        <p
          key={toast.id}
          className={`dance-toast max-w-[26rem] rounded-2xl px-4 py-3 text-center text-[0.9375rem] font-medium shadow-[0_1rem_2.5rem_-0.75rem_rgb(0_0_0/0.6)] backdrop-blur-md ${
            toast.tone === "no"
              ? "border border-(--rose)/40 bg-[rgb(60_28_40/0.92)] text-(--moon)"
              : "border border-(--line-strong) bg-[rgb(46_37_57/0.92)] text-(--moon)"
          }`}
        >
          {toast.text}
        </p>
      )}
    </div>
  );
}
