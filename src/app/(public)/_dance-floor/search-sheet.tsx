"use client";

import { useEffect, useId, useState, type RefObject } from "react";
import { Check, ChevronUp, Disc3, Plus, Search, X } from "lucide-react";
import {
  MAX_SONG_TEXT,
  songKey,
  type SongSearchResponse,
  type SongSearchResult,
} from "@/lib/songs";
import type { FloorSongInput } from "./action-results";

/**
 * Finding a song to ask for: a full-screen sheet over the floor, opened by
 * the one big button at the bottom of it. Full screen because a phone's
 * keyboard takes half of it anyway, and the results need the rest.
 *
 * The search is the catalogue's, through this app (`searchPath`), and
 * every result says what picking it would do: add it, vote for it, or
 * nothing because it is already playing. Typing a song in is always the
 * last row, so an obscure song or a catalogue outage never blocks anyone.
 */

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

type Status = "idle" | "searching" | "ok" | "unavailable" | "slow";

/** Where a song already is, from the floor's own list. */
export type QueuedState = { stage: "playing" | "next" | "waiting"; votedUp: boolean };

export function SearchSheet({
  sheetRef,
  inputRef,
  searchPath,
  queued,
  onPick,
}: {
  sheetRef: RefObject<HTMLDialogElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  searchPath: string;
  queued: Map<string, QueuedState>;
  onPick: (song: FloorSongInput) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const titleId = useId();
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("searching");
      try {
        const response = await fetch(`${searchPath}?q=${encodeURIComponent(trimmed)}`, {
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
  }, [trimmed, searchPath]);

  // Start clean every time it is opened.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const reset = () => {
      setQuery("");
      setResults([]);
      setStatus("idle");
    };
    sheet.addEventListener("close", reset);
    return () => sheet.removeEventListener("close", reset);
  }, [sheetRef]);

  const searching = trimmed.length >= MIN_QUERY;
  const message = !searching
    ? null
    : status === "unavailable"
      ? "The music catalogue is not answering right now. You can still ask for it by name."
      : status === "slow"
        ? "That was a lot of searching - give it a moment."
        : status === "ok" && results.length === 0
          ? `No matches for “${trimmed}”.`
          : null;

  return (
    <dialog
      ref={sheetRef}
      aria-labelledby={titleId}
      className="dance-sheet m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-(--night) p-0 text-(--moon) sm:mx-auto sm:max-w-[32rem] sm:border-x sm:border-(--line)"
      onClick={(event) => {
        // A tap on the backdrop, where the sheet does not cover the screen.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-(--line) px-4 pt-[max(env(safe-area-inset-top),0.875rem)] pb-3">
          <h2 id={titleId} className="sr-only">
            Request a song
          </h2>
          <label className="relative flex min-w-0 flex-1 items-center">
            <span className="sr-only">Search for a song or an artist</span>
            <Search size={20} aria-hidden className="pointer-events-none absolute left-4 text-(--moon-faint)" />
            <input
              ref={inputRef}
              type="search"
              autoComplete="off"
              autoCorrect="off"
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
              onKeyDown={(event) => {
                // Enter puts the keyboard away so the results can be seen.
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              placeholder="Song or artist"
              className="h-12 w-full appearance-none rounded-full border border-(--line-strong) bg-(--night-raised) pr-11 pl-12 text-[1.0625rem] text-(--moon) placeholder:text-(--moon-faint) focus:border-(--champagne)/60 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear the search"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setStatus("idle");
                  inputRef.current?.focus();
                }}
                className="absolute right-1 flex size-10 cursor-pointer items-center justify-center rounded-full text-(--moon-soft) hover:text-(--moon)"
              >
                <X size={18} aria-hidden />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => sheetRef.current?.close()}
            className="min-h-12 shrink-0 cursor-pointer px-2 text-[1rem] font-semibold text-(--champagne)"
          >
            Cancel
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          {!searching ? (
            <div className="px-6 pt-14 text-center">
              <p className="dance-display text-[2rem] leading-tight">What should they play?</p>
              <p className="mx-auto mt-2 max-w-[20rem] text-[1rem] leading-relaxed text-(--moon-soft)">
                Search by title or artist. Picking a song puts it on the list with your vote.
              </p>
            </div>
          ) : (
            <>
              {status === "searching" && results.length === 0 ? (
                <Skeletons />
              ) : (
                <ul
                  aria-busy={status === "searching"}
                  className={`pt-1 transition-opacity duration-200 ${status === "searching" ? "opacity-60" : ""}`}
                >
                  {results.map((match) => (
                    <li key={match.externalId}>
                      <ResultRow
                        match={match}
                        where={queued.get(songKey(match.title, match.artist))}
                        onPick={() =>
                          onPick({ title: match.title, artist: match.artist, externalId: match.externalId })
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}

              {message && (
                <p role="status" className="px-5 pt-4 pb-1 text-[0.9375rem] text-(--moon-soft)">
                  {message}
                </p>
              )}

              {status !== "searching" || results.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onPick({ title: trimmed, artist: null, externalId: null })}
                  className="mt-2 flex w-full cursor-pointer items-center gap-3.5 px-5 py-3 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-(--line-strong) text-(--moon-soft)" aria-hidden>
                    <Plus size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.875rem] text-(--moon-soft)">Not listed?</span>
                    <span className="line-clamp-2 text-[1rem] font-semibold [overflow-wrap:anywhere]">
                      Ask for “{trimmed}” by name
                    </span>
                  </span>
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

function ResultRow({
  match,
  where,
  onPick,
}: {
  match: SongSearchResult;
  where: QueuedState | undefined;
  onPick: () => void;
}) {
  const action = !where
    ? { label: "Add", icon: <Plus size={16} strokeWidth={2.5} />, strong: true }
    : where.stage === "playing"
      ? { label: "Playing", icon: <span className="dance-eq" aria-hidden><span /><span /><span /></span>, strong: false }
      : where.stage === "next"
        ? { label: "Next", icon: <Disc3 size={16} />, strong: false }
        : where.votedUp
          ? { label: "Voted", icon: <Check size={16} strokeWidth={2.5} />, strong: false }
          : { label: "Vote", icon: <ChevronUp size={16} strokeWidth={2.5} />, strong: true };
  const description = !where
    ? "Add it to the list"
    : where.stage === "playing"
      ? "Playing now"
      : where.stage === "next"
        ? "Playing next"
        : where.votedUp
          ? "On the list, with your vote"
          : "On the list - picking it adds your vote";

  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`${match.title}, ${match.artist}. ${description}.`}
      className="flex w-full cursor-pointer items-center gap-3.5 px-5 py-2.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
    >
      {match.artwork ? (
        // The catalogue's cover, from its CDN. `next/image` is banned on
        // public pages: `/_next/image` is not public, by design.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={match.artwork}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-12 shrink-0 rounded-xl bg-(--night-raised) object-cover"
        />
      ) : (
        <span aria-hidden className="size-12 shrink-0 rounded-xl bg-(--night-raised)" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1rem] font-semibold">{match.title}</span>
        <span className="block truncate text-[0.875rem] text-(--moon-soft)">
          {match.artist}
        </span>
      </span>
      <span
        aria-hidden
        className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[0.8125rem] font-bold ${
          action.strong
            ? "bg-(--champagne) text-(--on-champagne)"
            : "border border-(--line-strong) text-(--moon-soft)"
        }`}
      >
        {action.icon}
        {action.label}
      </span>
    </button>
  );
}

function Skeletons() {
  return (
    <ul aria-hidden className="pt-1">
      {[72, 56, 64, 48, 60].map((width, i) => (
        <li key={i} className="flex items-center gap-3.5 px-5 py-2.5">
          <span className="dance-skeleton size-12 shrink-0 rounded-xl" />
          <span className="flex-1 space-y-2">
            <span className="dance-skeleton block h-3.5 rounded-full" style={{ width: `${width}%` }} />
            <span className="dance-skeleton block h-3 w-1/3 rounded-full" />
          </span>
        </li>
      ))}
    </ul>
  );
}
