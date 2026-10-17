"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { groupByDay, tileRatio, type GalleryItem } from "@/lib/gallery";
import { Lightbox } from "./lightbox";
import { photoSources, type GallerySource } from "./sources";

/**
 * The photo gallery: one component for the guests' album and the
 * planner's copy of it, so the two never drift into different ideas of
 * what looking at the photographs is like.
 *
 * **Justified rows**, not columns. CSS columns fill top to bottom, so an
 * album "newest first" read newest-first down the left column and then
 * jumped back to the top; rows read the way a page does. Each tile is a
 * flex item whose grow and basis are both its aspect ratio, which makes
 * every tile in a row the same height whatever the row's width - the
 * justified layout with no measuring, no script and nothing to reflow
 * when the thumbnails arrive. A filler with a huge grow factor stops the
 * last row stretching a lone photograph across the page.
 *
 * **The open photograph is in the URL** (`?photo=`), pushed on open and
 * replaced as you move along, so a phone's back gesture closes the
 * lightbox instead of leaving the album, and a link to one photograph
 * opens on it.
 */

type Filter = { key: string; label: string; test: (item: GalleryItem) => boolean };

const ALBUM_FILTERS: Filter[] = [
  { key: "all", label: "All", test: () => true },
  { key: "guests", label: "Guests", test: (item) => !item.fromBooth },
  { key: "booth", label: "Photo booth", test: (item) => item.fromBooth },
];

const PLANNER_FILTERS: Filter[] = [
  { key: "all", label: "All", test: () => true },
  { key: "shown", label: "On the album", test: (item) => !item.hidden },
  { key: "hidden", label: "Hidden", test: (item) => Boolean(item.hidden) },
  { key: "booth", label: "Photo booth", test: (item) => item.fromBooth },
];

const PARAM = "photo";

export function PhotoGallery({
  source,
  photos,
  tileAction,
  lightboxAction,
}: {
  source: GallerySource;
  photos: GalleryItem[];
  /** A control laid over each tile, outside its open button. Planner only. */
  tileAction?: (item: GalleryItem) => ReactNode;
  /** A control in the lightbox's top bar. Planner only. */
  lightboxAction?: (item: GalleryItem) => ReactNode;
}) {
  const sources = photoSources(source);

  /*
   * Only the filters that would split the list. A filter that matches
   * everything or nothing is a button that does nothing, and the album of
   * a wedding with no booth should not offer one.
   */
  const filters = useMemo(() => {
    const all = source === "planner" ? PLANNER_FILTERS : ALBUM_FILTERS;
    const useful = all.filter((filter) => {
      if (filter.key === "all") return true;
      const matched = photos.filter(filter.test).length;
      return matched > 0 && matched < photos.length;
    });
    return useful.length > 1 ? useful : [];
  }, [photos, source]);

  const [filterKey, setFilterKey] = useState("all");
  const filter = filters.find((f) => f.key === filterKey) ?? ALBUM_FILTERS[0];
  const items = useMemo(() => photos.filter(filter.test), [photos, filter]);
  const groups = useMemo(() => groupByDay(items), [items]);

  // ---- The open photograph lives in the URL. ------------------------------

  /*
   * Read through Next rather than kept in state: `pushState` and
   * `replaceState` are wired into the router, so back and forward move
   * the lightbox for free, and a link straight to one photograph renders
   * open on it from the server.
   */
  const searchParams = useSearchParams();
  const raw = searchParams.get(PARAM);
  const openId = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;

  /** Whether opening pushed a history entry, which closing should pop. */
  const pushed = useRef(false);
  /** Where the open photograph was, for when it drops out of the list. */
  const lastIndex = useRef<number | null>(null);

  const writeUrl = useCallback((id: number | null, mode: "push" | "replace") => {
    const url = new URL(window.location.href);
    if (id === null) url.searchParams.delete(PARAM);
    else url.searchParams.set(PARAM, String(id));
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  const open = useCallback(
    (id: number) => {
      pushed.current = true;
      writeUrl(id, "push");
    },
    [writeUrl],
  );

  const navigate = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) writeUrl(item.id, "replace");
    },
    [items, writeUrl],
  );

  /*
   * Closing pops the entry opening pushed, so the back button afterwards
   * leaves the album as it should. Opened from a link instead, there is
   * nothing of ours to pop and the parameter is simply dropped.
   */
  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      writeUrl(null, "replace");
    }
  }, [writeUrl]);

  const found = openId === null ? -1 : items.findIndex((item) => item.id === openId);

  useEffect(() => {
    if (found >= 0) lastIndex.current = found;
  }, [found]);

  /*
   * The open photograph can leave the list under the lightbox - the
   * couple hid it while the filter shows only what is on the album. Move
   * to whatever now sits in its place rather than closing on them. One
   * that was never here (a hidden photograph's old link, a typo) closes.
   */
  useEffect(() => {
    if (openId === null || found >= 0) return;
    if (lastIndex.current === null || items.length === 0) close();
    else navigate(Math.min(lastIndex.current, items.length - 1));
  }, [openId, found, items.length, close, navigate]);

  return (
    <>
      {/* The filters carry the counts; without them the planner still wants one. */}
      {filters.length === 0 && source === "planner" && (
        <p className="mb-4 text-xs text-ink-faint">
          <span className="figures">{photos.length}</span> in all
        </p>
      )}
      {filters.length > 0 && (
        /*
         * One row, always: centred while it fits, and scrolled sideways
         * rather than wrapped when it does not - a chip orphaned on a
         * second line reads as a different control.
         */
        <div
          role="group"
          aria-label="Show"
          className="no-scrollbar mb-6 flex w-fit max-w-full gap-2 overflow-x-auto data-[source=album]:mx-auto"
          data-source={source}
        >
          {filters.map((f) => {
            const active = f.key === filter.key;
            const count = photos.filter(f.test).length;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilterKey(f.key)}
                className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm whitespace-nowrap transition-colors pointer-coarse:min-h-11 ${
                  active
                    ? "border-ink bg-ink text-paper"
                    : "border-hairline-strong bg-card/70 text-ink-soft hover:border-ink-faint hover:text-ink"
                }`}
              >
                {f.label}
                <span className={`figures text-xs ${active ? "text-paper/70" : "text-ink-faint"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {groups.map((group) => (
        <section key={group.day} className="mb-8 last:mb-0" aria-label={groups.length > 1 ? group.label : undefined}>
          {/* A heading only when there is more than one day to tell apart. */}
          {groups.length > 1 && (
            <h3 className="mb-3 flex items-baseline gap-3 text-ink-soft">
              <span className="eyebrow">{group.label}</span>
              <span className="figures text-xs text-ink-faint">{group.items.length}</span>
            </h3>
          )}
          <ul
            className="flex flex-wrap items-start gap-1.5 [--row:8.5rem] sm:gap-2 sm:[--row:11rem] lg:[--row:13.5rem]"
            data-source={source}
          >
            {group.items.map((item) => (
              <Tile
                key={item.id}
                item={item}
                source={source}
                thumb={sources.thumb(item.id)}
                onOpen={() => open(item.id)}
                action={tileAction?.(item)}
              />
            ))}
            {/* Soaks up the last row's slack so it keeps its height. */}
            <li aria-hidden className="h-0 grow-[1000000] basis-0" />
          </ul>
        </section>
      ))}

      <Lightbox
        items={items}
        index={found >= 0 ? found : null}
        sources={sources}
        onNavigate={navigate}
        onClose={close}
        action={lightboxAction}
      />
    </>
  );
}

function Tile({
  item,
  source,
  thumb,
  onOpen,
  action,
}: {
  item: GalleryItem;
  source: GallerySource;
  thumb: string;
  onOpen: () => void;
  action?: ReactNode;
}) {
  const ratio = tileRatio(item);
  const label = [item.caption, item.uploaderName].filter(Boolean).join(" · ");
  return (
    <li
      className="group relative"
      style={{ flexGrow: ratio, flexBasis: `calc(var(--row) * ${ratio})`, aspectRatio: ratio }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={label ? `Open photograph: ${label}` : "Open photograph"}
        className={`absolute inset-0 block overflow-hidden bg-hairline transition-[opacity,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass ${
          source === "album"
            ? "rounded-[3px] shadow-card hover:shadow-overlay"
            : "rounded-md border border-hairline"
        } ${item.hidden ? "opacity-35" : ""}`}
      >
        {/*
         * A plain <img>, deliberately. next/image would need
         * `/_next/image` open to guests, and its optimiser fetches any
         * same-origin path it is handed - on the planner's routes it would
         * meet the sign-in instead of a photograph. The thumbnail was made
         * on the uploader's phone instead.
         */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt=""
          width={item.width ?? undefined}
          height={item.height ?? undefined}
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
        {label && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-spine/80 to-transparent px-2.5 pt-8 pb-2 text-left text-xs leading-snug text-spine-ink opacity-0 transition-opacity duration-300 group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
            {label}
          </span>
        )}
      </button>
      {item.hidden && (
        <span className="pointer-events-none absolute top-1.5 left-1.5 rounded-full bg-madder px-2 py-0.5 text-[0.6875rem] font-medium text-white">
          Hidden
        </span>
      )}
      {action}
    </li>
  );
}
