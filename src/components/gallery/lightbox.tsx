"use client";

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  MAX_ZOOM,
  REST,
  TAP_ZOOM,
  clampView,
  trueRatio,
  wrapIndex,
  zoomAbout,
  type GalleryItem,
  type View,
} from "@/lib/gallery";
import type { PhotoSources } from "./sources";

/**
 * One photograph at a time, on the spine dark.
 *
 * Three slides sit side by side on a track - the one before, this one,
 * the one after - so a swipe drags real neighbours into view and they are
 * already fetched by the time it lands. Slides are keyed by an unwrapped
 * position rather than by photograph, so the slide that slid in *becomes*
 * the current one without remounting (its full-size image stays decoded)
 * and an album of two, whose neighbour on both sides is the same
 * photograph, still has three distinct slides.
 *
 * Gestures are pointer events on the stage, written out rather than
 * borrowed from a library: one finger swipes along the album, or pans
 * once zoomed; two pinch; a double tap zooms to the point tapped; a drag
 * down puts the photograph back. A single tap shows and hides the
 * controls, which is how every phone's own photo viewer behaves.
 */

const GAP = 24;
const SLIDE_MS = 280;
const DOUBLE_TAP_MS = 300;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

type Gesture =
  | { kind: "pending"; x: number; y: number; t: number; type: string }
  | { kind: "swipe"; x: number; t: number }
  | { kind: "dismiss"; y: number; t: number }
  | { kind: "pan"; x: number; y: number; view: View; moved: boolean; type: string; t: number }
  | {
      kind: "pinch";
      distance: number;
      mid: { x: number; y: number };
      view: View;
    };

export function Lightbox({
  items,
  index,
  sources,
  onNavigate,
  onClose,
  action,
}: {
  items: GalleryItem[];
  /** The open photograph, or null when the lightbox is shut. */
  index: number | null;
  sources: PhotoSources;
  onNavigate: (index: number) => void;
  onClose: () => void;
  action?: (item: GalleryItem) => ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const count = items.length;
  const isOpen = index !== null;

  // ---- Opening and shutting the native dialog. ---------------------------

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      // Not the first control in the bar: in the planner that is "Hide".
      closeRef.current?.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // ---- Where we are on the track. ----------------------------------------

  /** Unwrapped position: goes past the ends so keys stay stable. */
  const [pos, setPos] = useState(index ?? 0);
  const [offset, setOffset] = useState(0);
  const [sliding, setSliding] = useState(false);
  const [trackEased, setTrackEased] = useState(false);
  const [view, setView] = useState<View>(REST);
  const [viewEased, setViewEased] = useState(false);
  const [drop, setDrop] = useState(0);
  const [chrome, setChrome] = useState(true);

  // Adjusted during render rather than in an effect, so a jump from the
  // filmstrip never paints one frame of the old photograph.
  if (index !== null && !sliding && wrapIndex(pos, count) !== index) {
    setPos(index);
    setView(REST);
  }

  // A fresh open starts at rest with the controls showing.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setChrome(true);
      setDrop(0);
      setOffset(0);
      setView(REST);
    }
  }

  const current = index === null ? null : items[index];

  const slide = useCallback(
    (direction: 1 | -1) => {
      if (count < 2 || sliding || index === null) return;
      setSliding(true);
      setTrackEased(true);
      setOffset(-direction * (window.innerWidth + GAP));
      // A timer rather than transitionend: under reduced motion the
      // transition is near-instant and a missed event would strand us.
      window.setTimeout(() => {
        setTrackEased(false);
        setOffset(0);
        setPos((p) => p + direction);
        setView(REST);
        setSliding(false);
        onNavigate(wrapIndex(index + direction, count));
      }, SLIDE_MS);
    },
    [count, index, onNavigate, sliding],
  );

  // ---- Geometry. ---------------------------------------------------------

  const geometry = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !current) return null;
    const rect = stage.getBoundingClientRect();
    const ratio = trueRatio(current);
    const width = Math.min(rect.width, rect.height * ratio);
    return {
      rect,
      stage: { width: rect.width, height: rect.height },
      photo: { width, height: width / ratio },
      /** A client point relative to the stage's centre. */
      local: (x: number, y: number) => ({
        x: x - (rect.left + rect.width / 2),
        y: y - (rect.top + rect.height / 2),
      }),
    };
  }, [current]);

  const zoomTo = useCallback(
    (next: View) => {
      const g = geometry();
      if (!g) return;
      setViewEased(true);
      setView(clampView(next, g.photo, g.stage));
    },
    [geometry],
  );

  // ---- Keys. -------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") slide(1);
      else if (event.key === "ArrowLeft") slide(-1);
      else if (event.key === "+" || event.key === "=") zoomTo({ ...view, scale: view.scale * 1.5 });
      else if (event.key === "-") zoomTo({ ...view, scale: view.scale / 1.5 });
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, slide, view, zoomTo]);

  // ---- The trackpad: pinch zooms, two fingers pan once zoomed. ------------

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !isOpen) return;
    const onWheel = (event: WheelEvent) => {
      const g = geometry();
      if (!g) return;
      if (event.ctrlKey) {
        // A trackpad pinch arrives as a wheel event with ctrlKey set.
        event.preventDefault();
        setViewEased(false);
        setView((v) => {
          const scale = Math.min(MAX_ZOOM, Math.max(1, v.scale * Math.exp(-event.deltaY * 0.01)));
          return clampView(zoomAbout(v, scale, g.local(event.clientX, event.clientY)), g.photo, g.stage);
        });
      } else {
        setView((v) => {
          if (v.scale <= 1) return v;
          event.preventDefault();
          return clampView({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }, g.photo, g.stage);
        });
        setViewEased(false);
      }
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [geometry, isOpen]);

  // ---- Fingers and the mouse. --------------------------------------------

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapTimer = useRef<number | undefined>(undefined);

  const pinchFrom = (view: View): Gesture | null => {
    const g = geometry();
    const [a, b] = [...pointers.current.values()];
    if (!g || !a || !b) return null;
    return {
      kind: "pinch",
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      mid: g.local((a.x + b.x) / 2, (a.y + b.y) / 2),
      view,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (sliding || (event.pointerType === "mouse" && event.button !== 0)) return;
    // Controls on the stage handle their own clicks.
    if ((event.target as HTMLElement).closest("button, a")) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer already went (a lifted finger racing the event). The
      // gesture still works; it just stops following off the stage.
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setTrackEased(false);
    setViewEased(false);

    if (pointers.current.size === 2) {
      gesture.current = pinchFrom(view);
    } else if (pointers.current.size === 1) {
      gesture.current =
        view.scale > 1
          ? {
              kind: "pan",
              x: event.clientX,
              y: event.clientY,
              view,
              moved: false,
              type: event.pointerType,
              t: event.timeStamp,
            }
          : {
              kind: "pending",
              x: event.clientX,
              y: event.clientY,
              t: event.timeStamp,
              type: event.pointerType,
            };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    const geo = geometry();
    if (!g || !geo) return;

    if (g.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = geo.local((a.x + b.x) / 2, (a.y + b.y) / 2);
      // A little give below 1x and above the maximum, settled on release.
      const scale = Math.min(MAX_ZOOM * 1.15, Math.max(0.85, (g.view.scale * distance) / g.distance));
      const zoomed = zoomAbout(g.view, scale, g.mid);
      setView({ scale, x: zoomed.x + mid.x - g.mid.x, y: zoomed.y + mid.y - g.mid.y });
      return;
    }

    if (g.kind === "pan") {
      const dx = event.clientX - g.x;
      const dy = event.clientY - g.y;
      if (Math.hypot(dx, dy) > 6) g.moved = true;
      setView(clampView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy }, geo.photo, geo.stage));
      return;
    }

    if (g.kind === "pending") {
      const dx = event.clientX - g.x;
      const dy = event.clientY - g.y;
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        gesture.current = count > 1 ? { kind: "swipe", x: g.x, t: g.t } : null;
      } else {
        gesture.current = dy > 0 ? { kind: "dismiss", y: g.y, t: g.t } : null;
      }
    }

    const next = gesture.current;
    if (next?.kind === "swipe") setOffset(event.clientX - next.x);
    if (next?.kind === "dismiss") setDrop(Math.max(0, event.clientY - next.y));
  };

  const onTap = (x: number, y: number, t: number, type: string) => {
    const geo = geometry();
    if (!geo) return;
    const last = lastTap.current;
    if (last && t - last.t < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < 30) {
      lastTap.current = null;
      window.clearTimeout(tapTimer.current);
      zoomTo(view.scale > 1 ? REST : zoomAbout(REST, TAP_ZOOM, geo.local(x, y)));
      return;
    }
    lastTap.current = { t, x, y };

    const point = geo.local(x, y);
    const onPhoto =
      Math.abs(point.x - view.x) <= (geo.photo.width * view.scale) / 2 &&
      Math.abs(point.y - view.y) <= (geo.photo.height * view.scale) / 2;
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => {
      // A click in the dark around a photograph means "done"; a tap on a
      // phone, where there is barely any dark, means "get out of the way".
      if (type === "mouse") {
        if (!onPhoto) onClose();
      } else {
        setChrome((shown) => !shown);
      }
    }, DOUBLE_TAP_MS);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    const geo = geometry();
    if (!g || !geo) {
      gesture.current = null;
      return;
    }
    const cancelled = event.type === "pointercancel";

    if (g.kind === "pinch") {
      setViewEased(true);
      setView((v) => clampView(v, geo.photo, geo.stage));
      // Lifting one finger of two carries on as a pan with the other.
      const [rest] = [...pointers.current.values()];
      gesture.current = rest
        ? { kind: "pan", x: rest.x, y: rest.y, view: clampView(view, geo.photo, geo.stage), moved: true, type: "touch", t: event.timeStamp }
        : null;
      return;
    }

    gesture.current = null;
    const elapsed = Math.max(1, event.timeStamp - ("t" in g ? g.t : event.timeStamp));

    if (g.kind === "swipe") {
      const dx = event.clientX - g.x;
      const fast = Math.abs(dx) / elapsed > 0.45;
      if (!cancelled && (Math.abs(dx) > geo.stage.width * 0.18 || (fast && Math.abs(dx) > 30))) {
        slide(dx < 0 ? 1 : -1);
      } else {
        setTrackEased(true);
        setOffset(0);
      }
    } else if (g.kind === "dismiss") {
      const dy = event.clientY - g.y;
      if (!cancelled && (dy > 120 || (dy / elapsed > 0.6 && dy > 40))) {
        onClose();
      } else {
        setTrackEased(true);
        setDrop(0);
      }
    } else if (!cancelled && (g.kind === "pending" || (g.kind === "pan" && !g.moved))) {
      onTap(event.clientX, event.clientY, event.timeStamp, g.type);
    }
  };

  // Shutting by any route - Escape included - goes through onClose, so
  // the URL and the history entry are tidied by the one owner of them.
  const onCancel = (event: React.SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  useEffect(() => () => window.clearTimeout(tapTimer.current), []);

  // ---- The film strip follows along. --------------------------------------

  const stripRef = useRef<HTMLDivElement>(null);
  const stripPlaced = useRef(false);
  useEffect(() => {
    if (index === null) {
      stripPlaced.current = false;
      return;
    }
    const thumb = stripRef.current?.querySelector<HTMLElement>(`[data-strip="${index}"]`);
    // Glides along as you move, but starts where it should: scrolling
    // across from the first photograph on every open is motion for nothing.
    thumb?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: stripPlaced.current ? "smooth" : "instant",
    });
    stripPlaced.current = true;
  }, [index]);

  const dim = Math.max(0.15, 1 - drop / 360);

  return (
    <dialog
      ref={dialogRef}
      className="lightbox"
      data-chrome={chrome ? "shown" : "hidden"}
      style={{ "--dim": dim } as React.CSSProperties}
      onCancel={onCancel}
      aria-label={current ? `Photograph ${index! + 1} of ${count}` : "Photograph"}
    >
      {current && index !== null && (
        <>
          <div
            ref={stageRef}
            className="lightbox-stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <div
              className="absolute inset-0"
              style={{
                transform: `translateX(${offset}px)`,
                transition: trackEased ? `transform ${SLIDE_MS}ms ${EASE}` : "none",
              }}
            >
              {(count > 1 ? [-1, 0, 1] : [0]).map((step) => {
                const at = pos + step;
                const item = items[wrapIndex(at, count)];
                const isCurrent = step === 0;
                return (
                  <Slide
                    key={at}
                    item={item}
                    shift={step}
                    sources={sources}
                    current={isCurrent}
                    view={isCurrent ? view : REST}
                    viewEased={viewEased || trackEased}
                    drop={isCurrent ? drop : 0}
                  />
                );
              })}
            </div>
          </div>

          {/* The bar along the top. */}
          <div className="lightbox-chrome absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-spine/80 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6 sm:px-5">
            <p className="figures mr-auto pl-1 text-xs text-spine-ink-soft" aria-hidden>
              {index + 1} / {count}
            </p>
            {action?.(current)}
            <a
              href={sources.full(current.id)}
              download={`photograph-${current.id}.jpg`}
              className="lightbox-button"
            >
              <Download className="size-[1.1rem]" aria-hidden />
              <span className="max-sm:sr-only">Save</span>
            </a>
            <button ref={closeRef} type="button" onClick={onClose} className="lightbox-button" aria-label="Close">
              <X className="size-5" aria-hidden />
            </button>
          </div>

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => slide(-1)}
                className="lightbox-chrome lightbox-button lightbox-arrow left-2 sm:left-4"
                aria-label="Previous photograph"
              >
                <ChevronLeft className="size-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => slide(1)}
                className="lightbox-chrome lightbox-button lightbox-arrow right-2 sm:right-4"
                aria-label="Next photograph"
              >
                <ChevronRight className="size-6" aria-hidden />
              </button>
            </>
          )}

          {/* Who, when, and the strip to jump along it. */}
          <div className="lightbox-chrome absolute inset-x-0 bottom-0 bg-gradient-to-t from-spine/85 via-spine/50 to-transparent pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-2xl px-5 text-center" aria-live="polite">
              {current.caption && (
                <p className="font-display text-lg leading-snug text-spine-ink">{current.caption}</p>
              )}
              <p className="mt-1 text-sm text-spine-ink-soft">
                {current.hidden && (
                  <span className="mr-2 rounded-full bg-madder px-2 py-0.5 text-[0.6875rem] font-medium text-white">
                    Hidden
                  </span>
                )}
                {current.uploaderName ?? "A guest"}
                <span className="mx-1.5 opacity-60">·</span>
                {current.time}
              </p>
            </div>
            {count > 1 && (
              <div
                ref={stripRef}
                className="no-scrollbar mt-3 hidden gap-1.5 overflow-x-auto px-[50%] pb-1 sm:flex"
              >
                {items.map((item, at) => (
                  <button
                    key={item.id}
                    type="button"
                    data-strip={at}
                    onClick={() => onNavigate(at)}
                    aria-label={`Photograph ${at + 1}`}
                    aria-current={at === index ? "true" : undefined}
                    className={`h-12 shrink-0 overflow-hidden rounded-[3px] transition-[opacity,outline-color] ${
                      at === index
                        ? "opacity-100 outline-2 outline-offset-2 outline-brass-bright"
                        : "opacity-45 outline-2 outline-transparent hover:opacity-80"
                    }`}
                    style={{ aspectRatio: Math.min(1.6, Math.max(0.6, trueRatio(item))) }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sources.thumb(item.id)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={`size-full object-cover ${item.hidden ? "grayscale" : ""}`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}

/**
 * One photograph on the track. The thumbnail is already in the browser's
 * cache from the grid, so it is painted at once as the frame's background
 * and the full-size copy fades in over it when it lands - a sharp
 * picture arriving rather than a blank one.
 */
function Slide({
  item,
  shift,
  sources,
  current,
  view,
  viewEased,
  drop,
}: {
  item: GalleryItem;
  shift: number;
  sources: PhotoSources;
  current: boolean;
  view: View;
  viewEased: boolean;
  drop: number;
}) {
  const [loaded, setLoaded] = useState<number | null>(null);
  const ratio = trueRatio(item);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center [container-type:size]"
      // A whole viewport along, not a stage width: on a larger screen the
      // stage is inset from the sides, and a neighbour one stage-width
      // away would sit in plain view in the margin.
      style={{ transform: `translateX(calc(${shift} * (100vw + ${GAP}px)))` }}
      aria-hidden={!current}
      inert={!current}
    >
      <div
        className="relative bg-cover bg-center shadow-overlay will-change-transform"
        style={{
          width: `min(100cqw, ${ratio} * 100cqh)`,
          aspectRatio: ratio,
          backgroundImage: `url(${sources.thumb(item.id)})`,
          transform: `translate(${view.x}px, ${view.y + drop}px) scale(${view.scale * (1 - drop / 1600)})`,
          transition: viewEased ? `transform ${SLIDE_MS}ms ${EASE}` : "none",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sources.full(item.id)}
          alt={item.caption ?? "A photograph from the day"}
          draggable={false}
          decoding="async"
          fetchPriority={current ? "high" : "low"}
          onLoad={() => setLoaded(item.id)}
          ref={(img) => {
            // Already in the cache: onLoad fired before React was listening.
            if (img?.complete && img.naturalWidth > 0 && loaded !== item.id) setLoaded(item.id);
          }}
          className={`size-full select-none transition-opacity duration-300 ${
            loaded === item.id ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    </div>
  );
}
