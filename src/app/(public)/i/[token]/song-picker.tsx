"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import type { PublicSongRequest } from "@/lib/public/queries";
import {
  MAX_SONG_REQUESTS,
  MAX_SONG_TEXT,
  sameSong,
  type SongSearchResponse,
  type SongSearchResult,
} from "@/lib/songs";

/**
 * The song picker on the reply card.
 *
 * A ruled line to type on, a list of matches underneath it as you type,
 * and the songs you have chosen written above - up to three. Each match
 * comes from the catalogue by way of the server, which is how the row
 * can say "already on the list": another household asked for it, and
 * the card says so without saying whose.
 *
 * Typing is always a way in. The last row of every list is "add as
 * typed", so a song the catalogue has never heard of, or a catalogue
 * that is not answering, costs the guest nothing but the spelling. The
 * combobox pattern is the same one the planner's `Select` uses - focus
 * stays on the input, `aria-activedescendant` tracks the row - but the
 * furniture is the card's, not the ledger's.
 */

type Picked = {
  title: string;
  artist: string | null;
  externalId: string | null;
  alsoRequested: boolean;
};

type SearchStatus = "idle" | "searching" | "ok" | "unavailable" | "slow";

/** Long enough to let a word finish, short enough that the list feels live. */
const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

export function SongPicker({
  token,
  initial,
}: {
  token: string;
  initial: PublicSongRequest[];
}) {
  const [picked, setPicked] = useState<Picked[]>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const lastRemoveRef = useRef<HTMLButtonElement>(null);
  // Set when the third song goes on, so focus has somewhere to land when
  // the input it was in disappears.
  const focusLastRemove = useRef(false);

  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;
  const hintId = `${listId}-hint`;

  const full = picked.length >= MAX_SONG_REQUESTS;
  const trimmed = query.trim();

  // Debounced, and a stale answer is dropped: the controller for the
  // superseded query is aborted in the cleanup, so it cannot land on top
  // of a newer one. A query too short to search is cleared where it is
  // typed, in `onChange`, so this effect only ever starts a search.
  useEffect(() => {
    if (trimmed.length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("searching");
      try {
        const response = await fetch(
          `/i/${token}/songs?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
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

  useEffect(() => {
    if (full && focusLastRemove.current) {
      focusLastRemove.current = false;
      lastRemoveRef.current?.focus();
    }
  }, [full]);

  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  // The typed row is always last, so it is always reachable by arrow.
  const optionCount = results.length + (trimmed.length > 0 ? 1 : 0);
  const showList = open && optionCount > 0;

  function add(song: Picked) {
    // Asking for the same song twice is one request; say nothing and clear.
    if (!picked.some((other) => sameSong(other, song))) {
      const next = [...picked, song];
      if (next.length >= MAX_SONG_REQUESTS) focusLastRemove.current = true;
      setPicked(next);
    }
    setQuery("");
    setResults([]);
    setStatus("idle");
    setOpen(false);
    setActive(-1);
  }

  function choose(index: number) {
    if (index < 0 || index >= optionCount) return;
    const match = results[index];
    if (match) {
      add({
        title: match.title,
        artist: match.artist,
        externalId: match.externalId,
        alsoRequested: match.alreadyRequested,
      });
    } else {
      add({ title: trimmed, artist: null, externalId: null, alsoRequested: false });
    }
  }

  function remove(index: number) {
    setPicked((current) => current.filter((_, i) => i !== index));
    inputRef.current?.focus();
  }

  function step(from: number, by: number): number {
    if (optionCount === 0) return -1;
    return (((from + by) % optionCount) + optionCount) % optionCount;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        setActive(step(active, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        if (!open) setOpen(true);
        setActive(step(active, -1));
        return;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
          setActive(-1);
        }
        return;
      case "Enter":
        // Never the reply form's submit: Enter on this line means "this
        // song", or nothing at all when the line is blank.
        event.preventDefault();
        if (trimmed.length === 0) return;
        choose(showList && active >= 0 ? active : optionCount - 1);
        return;
    }
  }

  const hint = (() => {
    if (status === "searching") return "Looking…";
    if (status === "unavailable") return "The catalogue is not answering. Type it in and we will pass it on.";
    if (status === "slow") return "One moment - that was a lot of searching.";
    if (status === "ok" && results.length === 0) return "Nothing by that name, but you can add it as typed.";
    return "";
  })();

  return (
    <div>
      <p className="eyebrow text-ink-faint" id={`${listId}-label`}>
        Songs that will get you dancing
      </p>
      <p className="mt-1 text-xs text-ink-faint">
        Up to three.
      </p>

      {picked.length > 0 && (
        <ol className="mt-3">
          {picked.map((song, index) => (
            <li
              key={`${song.externalId ?? "typed"}-${song.title}-${song.artist ?? ""}`}
              className="flex items-start justify-between gap-3 border-b border-hairline py-3 animate-fade"
            >
              <input type="hidden" name={`song-${index}-title`} value={song.title} />
              <input type="hidden" name={`song-${index}-artist`} value={song.artist ?? ""} />
              <input type="hidden" name={`song-${index}-id`} value={song.externalId ?? ""} />
              <div className="min-w-0">
                <p className="font-display text-[1.1rem] leading-snug text-ink">
                  {song.title}
                </p>
                {song.artist && (
                  <p className="mt-0.5 text-sm text-ink-soft">{song.artist}</p>
                )}
                {song.alsoRequested && (
                  <p className="mt-1 text-xs text-brass">
                    Someone else has asked for this one too.
                  </p>
                )}
              </div>
              <button
                ref={index === picked.length - 1 ? lastRemoveRef : undefined}
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove ${song.title}`}
                className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
              >
                <X size={16} strokeWidth={1.5} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}

      {full ? (
        <p className="mt-3 text-xs text-ink-faint">
          That is your three. Take one off to change it.
        </p>
      ) : (
        <div className="relative mt-1">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-labelledby={`${listId}-label`}
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
            aria-describedby={hintId}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="done"
            maxLength={MAX_SONG_TEXT}
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              setOpen(true);
              setActive(-1);
              if (next.trim().length < MIN_QUERY) {
                setResults([]);
                setStatus("idle");
              }
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            placeholder={picked.length === 0 ? "Search for a title or an artist…" : "And another…"}
            className="field-line"
          />

          {showList && (
            <ul
              id={listId}
              role="listbox"
              aria-labelledby={`${listId}-label`}
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto border border-hairline bg-card py-1 shadow-card"
            >
              {results.map((match, index) => (
                <li
                  key={match.externalId}
                  id={optionId(index)}
                  role="option"
                  aria-selected={active === index}
                  // Mouse down would blur the input and close the list
                  // before the click landed.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                  onMouseMove={() => setActive(index)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${
                    active === index ? "bg-paper" : ""
                  }`}
                >
                  {match.artwork ? (
                    // The catalogue's own cover, straight from its CDN.
                    // `next/image` is off limits on the public pages
                    // because `/_next/image` is deliberately not public.
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
                    <span className="block truncate text-[0.95rem] text-ink">
                      {match.title}
                    </span>
                    <span className="block truncate text-xs text-ink-faint">
                      {match.artist}
                      {match.album ? ` · ${match.album}` : ""}
                    </span>
                    {/* Beneath rather than beside: a tag on the right
                        would take the title's room on a phone. */}
                    {match.alreadyRequested && (
                      <span className="eyebrow mt-0.5 block text-brass">
                        Already on the list
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {trimmed.length > 0 && (
                <li
                  id={optionId(results.length)}
                  role="option"
                  aria-selected={active === results.length}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(results.length)}
                  onMouseMove={() => setActive(results.length)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-ink-soft ${
                    results.length > 0 ? "border-t border-hairline" : ""
                  } ${active === results.length ? "bg-paper" : ""}`}
                >
                  <span aria-hidden className="flex size-10 shrink-0 items-center justify-center font-display text-lg text-ink-faint">
                    +
                  </span>
                  <span className="min-w-0 truncate">
                    Add <span className="text-ink">“{trimmed}”</span> as typed
                  </span>
                </li>
              )}
            </ul>
          )}

          <p
            id={hintId}
            role="status"
            aria-live="polite"
            className="mt-2 min-h-4 text-xs text-ink-faint"
          >
            {hint}
          </p>
        </div>
      )}
    </div>
  );
}
