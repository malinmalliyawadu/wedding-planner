"use client";

import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { ChevronUp } from "lucide-react";
import type { DanceFloor, FloorSong } from "@/lib/public/queries";
import {
  MAX_SONG_TEXT,
  songKey,
  type SongSearchResponse,
  type SongSearchResult,
} from "@/lib/songs";
import { requestSong, voteOnSong } from "./actions";

/**
 * The live half of the dance floor.
 *
 * Polls `./state` every few seconds while the page is in front of the
 * guest - not while the phone is in a pocket - and straight after each of
 * their own taps, so a vote lands on screen at once. The search is the
 * reply card's (`/i/[token]/songs`), but a pick here goes straight onto
 * the queue rather than onto a card to send.
 */

const POLL_MS = 5000;
const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

type SearchStatus = "idle" | "searching" | "ok" | "unavailable" | "slow";

export function Floor({ token, initial }: { token: string; initial: DanceFloor }) {
  const [floor, setFloor] = useState<DanceFloor | null>(initial);
  const [message, setMessage] = useState<{ tone: "ok" | "no"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/i/${token}/dance-floor/state`, { cache: "no-store" });
      if (response.status === 404) {
        setFloor(null);
        return;
      }
      if (response.ok) setFloor((await response.json()) as DanceFloor);
    } catch {
      // A dropped poll on marquee wifi is not worth a word; the next one
      // will land.
    }
  }, [token]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  function act(run: () => Promise<{ ok: true } | { ok: false; message: string }>, success?: string) {
    startTransition(async () => {
      const result = await run();
      setMessage(result.ok ? (success ? { tone: "ok", text: success } : null) : { tone: "no", text: result.message });
      await refresh();
    });
  }

  if (floor === null) {
    return (
      <p className="formula text-center text-[1.15rem] text-ink-soft">
        Requests are closed for now. Enjoy the music.
      </p>
    );
  }

  const queuedKeys = new Map<string, FloorSong | "on">(
    floor.upNext.map((song) => [songKey(song.title, song.artist), song]),
  );
  if (floor.nowPlaying) {
    queuedKeys.set(songKey(floor.nowPlaying.title, floor.nowPlaying.artist), "on");
  }

  return (
    <div className="space-y-14" aria-busy={pending}>
      <NowPlaying
        floor={floor}
        disabled={pending}
        onSkip={(id, on) => act(() => voteOnSong(token, id, "skip", on))}
      />

      <div id="ask" className="scroll-mt-24">
        <Ask
          token={token}
          floor={floor}
          queuedKeys={queuedKeys}
          disabled={pending}
          onRequest={(song) =>
            act(() => requestSong(token, song), `“${song.title}” is on the list.`)
          }
          onUpvote={(id) => act(() => voteOnSong(token, id, "up", true), "Vote counted.")}
          onNote={(text) => setMessage({ tone: "ok", text })}
        />
        <p role="status" aria-live="polite" className={`mt-3 min-h-5 text-sm ${message?.tone === "no" ? "text-madder" : "text-brass"}`}>
          {message?.text}
        </p>
      </div>

      <div id="up-next" className="scroll-mt-24">
        <UpNext
          songs={floor.upNext}
          disabled={pending}
          onVote={(id, on) => act(() => voteOnSong(token, id, "up", on))}
        />
      </div>
    </div>
  );
}

function NowPlaying({
  floor,
  disabled,
  onSkip,
}: {
  floor: DanceFloor;
  disabled: boolean;
  onSkip: (id: number, on: boolean) => void;
}) {
  const song = floor.nowPlaying;
  if (!song) {
    return (
      <div className="text-center">
        <p className="eyebrow text-ink-faint">On now</p>
        <p className="formula mt-3 text-[1.15rem] text-ink-soft">
          Nothing from the list just yet - the DJ has the floor.
        </p>
      </div>
    );
  }
  return (
    <div className="text-center">
      <p className="eyebrow text-brass">On now</p>
      <p className="mt-3 font-display text-[clamp(1.6rem,6vw,2.25rem)] leading-tight text-ink">
        {song.title}
      </p>
      {song.artist && <p className="mt-1 text-ink-soft">{song.artist}</p>}
      {song.mine && <p className="eyebrow mt-2 text-brass">Your request</p>}

      <div className="mt-6 flex flex-col items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={song.votedSkip}
          onClick={() => onSkip(song.id, !song.votedSkip)}
          className={`inline-flex min-h-11 items-center justify-center rounded-full border px-6 text-[0.8125rem] font-semibold tracking-caps uppercase transition-colors disabled:opacity-45 ${
            song.votedSkip
              ? "border-ink bg-ink text-paper hover:bg-spine-raised"
              : "border-hairline-strong text-ink hover:border-ink-faint"
          }`}
        >
          {song.votedSkip ? "You'd skip this · undo" : "Not for me"}
        </button>
        <p className="text-xs text-ink-faint">
          <span className="font-display text-sm text-ink">{song.skipVotes}</span> of{" "}
          {song.skipVotesNeeded} {song.skipVotesNeeded === 1 ? "vote" : "votes"} to skip
        </p>
      </div>
    </div>
  );
}

function Ask({
  token,
  floor,
  queuedKeys,
  disabled,
  onRequest,
  onUpvote,
  onNote,
}: {
  token: string;
  floor: DanceFloor;
  queuedKeys: Map<string, FloorSong | "on">;
  disabled: boolean;
  onRequest: (song: { title: string; artist: string | null; externalId: string | null }) => void;
  onUpvote: (id: number) => void;
  onNote: (text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const labelId = useId();
  const trimmed = query.trim();
  const full = floor.yourWaiting >= floor.maxWaiting;

  useEffect(() => {
    if (trimmed.length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("searching");
      try {
        const response = await fetch(`/i/${token}/songs?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as SongSearchResponse;
        if (controller.signal.aborted) return;
        if ("error" in body) {
          setResults([]);
          setStatus(body.error === "slow_down" ? "slow" : "unavailable");
        } else {
          setResults(body.results);
          setStatus("ok");
        }
      } catch {
        if (controller.signal.aborted) return;
        setResults([]);
        setStatus("unavailable");
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, token]);

  function clear() {
    setQuery("");
    setResults([]);
    setStatus("idle");
  }

  function pick(song: { title: string; artist: string | null; externalId: string | null }) {
    const existing = queuedKeys.get(songKey(song.title, song.artist));
    // Already on the list: asking again is a vote for it, which is what
    // the guest meant.
    if (existing === "on") {
      onNote("That one is on now.");
    } else if (existing) {
      if (existing.stage === "waiting" && !existing.votedUp) onUpvote(existing.id);
      else onNote(existing.stage === "waiting" ? "You have voted for that one already." : "That one is coming up.");
    } else {
      onRequest(song);
    }
    clear();
  }

  const hint = (() => {
    if (status === "searching") return "Looking…";
    if (status === "unavailable") return "The catalogue is not answering. Type it in and we'll find it.";
    if (status === "slow") return "One moment - that was a lot of searching.";
    if (status === "ok" && results.length === 0) return "Nothing by that name, but you can add it as typed.";
    return "";
  })();

  return (
    <div>
      <p className="eyebrow text-ink-faint" id={labelId}>
        Ask for a song
      </p>
      <p className="mt-1 text-xs text-ink-faint">
        {full
          ? `You have ${floor.maxWaiting} waiting. Once one is up, ask for another.`
          : `Up to ${floor.maxWaiting} waiting at a time.`}
      </p>

      {!full && (
        <>
          <input
            type="search"
            aria-labelledby={labelId}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={MAX_SONG_TEXT}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value.trim().length < MIN_QUERY) {
                setResults([]);
                setStatus("idle");
              }
            }}
            placeholder="Search for a title or an artist…"
            className="field-line mt-1"
          />
          <p role="status" aria-live="polite" className="mt-2 min-h-4 text-xs text-ink-faint">
            {hint}
          </p>

          {trimmed.length > 0 && (
            <ul className="mt-1 border-t border-hairline">
              {results.map((match) => {
                const existing = queuedKeys.get(songKey(match.title, match.artist));
                return (
                  <li key={match.externalId} className="border-b border-hairline">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        pick({ title: match.title, artist: match.artist, externalId: match.externalId })
                      }
                      className="flex w-full items-center gap-3 py-2 text-left transition-colors hover:bg-paper/60 disabled:opacity-60"
                    >
                      {match.artwork ? (
                        // The catalogue's cover, from its CDN. `next/image`
                        // is banned on public pages: `/_next/image` is not
                        // public, by design.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={match.artwork}
                          alt=""
                          width={40}
                          height={40}
                          loading="lazy"
                          className="size-10 shrink-0 bg-paper object-cover"
                        />
                      ) : (
                        <span aria-hidden className="size-10 shrink-0 bg-paper" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.95rem] text-ink">{match.title}</span>
                        <span className="block truncate text-xs text-ink-faint">{match.artist}</span>
                        {existing && (
                          <span className="eyebrow mt-0.5 block text-brass">
                            {existing === "on"
                              ? "On now"
                              : existing.stage === "waiting" && !existing.votedUp
                                ? "On the list - tap to vote for it"
                                : "On the list"}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li className="border-b border-hairline">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => pick({ title: trimmed, artist: null, externalId: null })}
                  className="flex w-full items-center gap-3 py-2 text-left text-sm text-ink-soft transition-colors hover:bg-paper/60 disabled:opacity-60"
                >
                  <span aria-hidden className="flex size-10 shrink-0 items-center justify-center font-display text-lg text-ink-faint">
                    +
                  </span>
                  <span className="min-w-0 truncate">
                    Ask for <span className="text-ink">“{trimmed}”</span> as typed
                  </span>
                </button>
              </li>
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function UpNext({
  songs,
  disabled,
  onVote,
}: {
  songs: FloorSong[];
  disabled: boolean;
  onVote: (id: number, on: boolean) => void;
}) {
  return (
    <div>
      <p className="eyebrow text-ink-faint">Up next</p>
      {songs.length === 0 ? (
        <p className="formula mt-3 text-[1.1rem] text-ink-soft">
          The list is empty. Be the first to ask.
        </p>
      ) : (
        <ol className="mt-2">
          {songs.map((song) => (
            <li key={song.id} className="flex items-center justify-between gap-3 border-b border-hairline py-3">
              <div className="min-w-0">
                <p className="truncate font-display text-[1.1rem] leading-snug text-ink">{song.title}</p>
                {song.artist && <p className="truncate text-sm text-ink-soft">{song.artist}</p>}
                {(song.stage !== "waiting" || song.mine) && (
                  <p className="eyebrow mt-1 text-brass">
                    {[
                      song.stage === "next" ? "Next up" : song.stage === "finding" ? "Being found" : null,
                      song.mine ? "Yours" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              {song.stage === "waiting" && (
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={song.votedUp}
                  aria-label={`${song.votedUp ? "Take back your vote for" : "Vote for"} ${song.title}, ${song.upVotes} ${song.upVotes === 1 ? "vote" : "votes"}`}
                  onClick={() => onVote(song.id, !song.votedUp)}
                  className={`flex min-h-11 min-w-14 shrink-0 items-center justify-center gap-1 rounded-full border px-3 transition-colors disabled:opacity-45 ${
                    song.votedUp
                      ? "border-ink bg-ink text-paper hover:bg-spine-raised"
                      : "border-hairline-strong text-ink hover:border-ink-faint"
                  }`}
                >
                  <ChevronUp size={16} strokeWidth={1.75} aria-hidden />
                  <span className="font-display text-sm">{song.upVotes}</span>
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
