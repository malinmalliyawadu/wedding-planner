"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
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

/** Hands the page back after `openSearchSheet`; null while the sheet is shut. */
let releasePage: (() => void) | null = null;

/**
 * Opens the sheet with the floor behind it pinned where it was.
 *
 * `overflow: hidden` on the root is not enough on iOS: raising the
 * keyboard for the search field, and dropping it again, scrolls the
 * document underneath regardless, so a guest who cancelled came back to
 * a different part of the list from the one they left. Fixing the body
 * at its own offset leaves the document nothing to scroll, and the
 * offset is handed back to the window when the sheet closes, however it
 * closes. Done before `showModal`, because that is what focuses the
 * field. Called from the tap itself, or iOS will not raise the keyboard.
 */
export function openSearchSheet(sheet: HTMLDialogElement, input: HTMLInputElement) {
  if (sheet.open) return;
  const { body } = document;
  const y = window.scrollY;
  body.style.position = "fixed";
  body.style.top = `${-y}px`;
  body.style.insetInline = "0";
  const release = () => {
    if (releasePage !== release) return;
    releasePage = null;
    body.style.position = "";
    body.style.top = "";
    body.style.insetInline = "";
    window.scrollTo({ top: y, behavior: "instant" });
  };
  releasePage = release;
  // And for Escape, which closes it without going through here.
  sheet.addEventListener("close", release, { once: true });
  sheet.showModal();
  input.focus();
}

/**
 * Closes the sheet with the page already back where it was. The `close`
 * event comes a task later, after React has run the effects of the same
 * tap - one of which scrolls to the song just asked for, and would be
 * undone by a restore that waited for the event.
 */
export function closeSearchSheet(sheet: HTMLDialogElement) {
  releasePage?.();
  sheet.close();
}

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
  const listRef = useRef<HTMLDivElement>(null);
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

  // Keep the results clear of the keyboard. iOS shrinks the visual
  // viewport for it (and may scroll it), but the sheet must not shrink
  // with it: on iOS 26 the page stays visible past the visual viewport,
  // behind Safari's floating address pill and the see-through bar over
  // the keys, so a sheet cut to that height let the floor show through
  // underneath. It covers the whole screen instead, and pads its list by
  // however much of it the keyboard hides.
  useEffect(() => {
    const sheet = sheetRef.current;
    const viewport = window.visualViewport;
    if (!sheet || !viewport) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        sheet.style.setProperty("--sheet-top", `${viewport.offsetTop}px`);
        const hidden = sheet.getBoundingClientRect().bottom - (viewport.offsetTop + viewport.height);
        sheet.style.setProperty("--sheet-hidden", `${Math.max(0, hidden)}px`);
      });
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
    };
  }, [sheetRef]);

  // Only the results move. A drag anywhere else on the sheet - the search
  // bar, the empty state, a list too short to scroll - is handed by iOS to
  // the page behind, `overflow: hidden` or not, and with the keyboard up
  // it pans the whole visual viewport: the sheet slid about under the
  // finger, a frame behind it. Overscroll at the list's own ends is kept
  // in by `overscroll-contain`.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const hold = (event: TouchEvent) => {
      const list = listRef.current;
      const inList = list && event.target instanceof Node && list.contains(event.target);
      if (!inList || list.scrollHeight <= list.clientHeight) event.preventDefault();
    };
    sheet.addEventListener("touchmove", hold, { passive: false });
    return () => sheet.removeEventListener("touchmove", hold);
  }, [sheetRef]);

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
      className="dance-sheet m-0 max-h-none w-full max-w-none overflow-hidden p-0 text-(--moon) sm:mx-auto sm:max-w-[32rem] sm:border-x sm:border-(--line)"
      onClick={(event) => {
        // A tap on the backdrop, where the sheet does not cover the screen.
        if (event.target === event.currentTarget) closeSearchSheet(event.currentTarget);
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
            onClick={() => {
              if (sheetRef.current) closeSearchSheet(sheetRef.current);
            }}
            className="min-h-12 shrink-0 cursor-pointer px-2 text-[1rem] font-semibold text-(--champagne)"
          >
            Cancel
          </button>
        </div>

        <div
          ref={listRef}
          // A swipe through the results puts the keyboard away, as every
          // music app does, so the whole list can be seen.
          onTouchMove={() => {
            if (document.activeElement === inputRef.current) inputRef.current?.blur();
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(max(var(--sheet-hidden,0px),env(safe-area-inset-bottom))+1.5rem)]"
        >
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
