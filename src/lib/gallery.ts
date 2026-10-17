import { dayKeyNZ, formatClockNZ, formatDateFull } from "./dates";

/**
 * The photo gallery's arithmetic, shared by the guests' album and the
 * planner's copy of it. Pure: no DB, no React, so the parts that are
 * easy to get subtly wrong - where a zoomed photograph may be dragged to,
 * which day a photograph taken after midnight belongs to - are tested.
 */

/** One photograph as the gallery shows it. Serialisable: it crosses to the client. */
export type GalleryItem = {
  id: number;
  caption: string | null;
  uploaderName: string | null;
  width: number | null;
  height: number | null;
  /** Sent by the photo booth rather than a guest's phone. */
  fromBooth: boolean;
  /** Only the planner sees hidden photographs, so only the planner sets this. */
  hidden?: boolean;
  /** Auckland calendar day it was added, "YYYY-MM-DD". */
  day: string;
  /** Auckland time it was added, "8:42 pm". */
  time: string;
};

/**
 * Shapes a photograph row for the gallery. The timestamp is formatted
 * here, on the server, so the client never formats a date in whatever
 * zone the guest's phone is set to and the two cannot disagree.
 */
export function toGalleryItem(row: {
  id: number;
  caption: string | null;
  uploaderName: string | null;
  width: number | null;
  height: number | null;
  fromBooth: boolean;
  hidden?: boolean;
  createdAt: Date;
}): GalleryItem {
  const { createdAt, ...rest } = row;
  return { ...rest, day: dayKeyNZ(createdAt), time: formatClockNZ(createdAt) };
}

/**
 * The narrowest and widest a tile may be, as width over height.
 *
 * A justified row is as tall as its narrowest photograph allows, so one
 * freak panorama would otherwise squash a whole row into a ribbon (and a
 * strip of a screenshot would stand a single tile a screen tall). Outside
 * this range the tile crops; the lightbox always shows the whole frame.
 */
export const MIN_TILE_RATIO = 0.5;
export const MAX_TILE_RATIO = 2.4;

/** Width over height, for laying a tile out. Square when the shape is unknown. */
export function tileRatio(item: Pick<GalleryItem, "width" | "height">): number {
  if (!item.width || !item.height) return 1;
  const ratio = item.width / item.height;
  return Math.min(MAX_TILE_RATIO, Math.max(MIN_TILE_RATIO, ratio));
}

/** Width over height, uncropped, for the lightbox. */
export function trueRatio(item: Pick<GalleryItem, "width" | "height">): number {
  if (!item.width || !item.height) return 1;
  return item.width / item.height;
}

export type DayGroup<T> = { day: string; label: string; items: T[] };

/**
 * Runs of consecutive photographs added on the same day, in the order
 * given. Consecutive rather than collected, so a list sorted newest first
 * stays sorted: the caller decides the order and this only draws lines
 * through it.
 */
export function groupByDay<T extends Pick<GalleryItem, "day">>(
  items: T[],
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.day === item.day) last.items.push(item);
    else groups.push({ day: item.day, label: formatDateFull(item.day), items: [item] });
  }
  return groups;
}

/** Index arithmetic that goes round: past the last is the first again. */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

// ---------------------------------------------------------------------------
// Zooming and panning in the lightbox.
//
// Coordinates are in CSS pixels relative to the centre of the stage, which
// is also the centre of the photograph at rest. The photograph is drawn
// with `translate(x, y) scale(scale)` about its own centre.

export const MAX_ZOOM = 4;
/** What a double tap zooms to: close enough to read a face across a table. */
export const TAP_ZOOM = 2.5;

export type View = { scale: number; x: number; y: number };
export const REST: View = { scale: 1, x: 0, y: 0 };

/**
 * Keeps a zoomed photograph covering the stage. On an axis where the
 * scaled photograph is larger than the stage it may be dragged until its
 * edge meets the stage's edge and no further; on an axis where it is
 * smaller it stays centred, because a picture you can push into a corner
 * of a black screen is a picture that looks broken.
 */
export function clampView(
  view: View,
  photo: { width: number; height: number },
  stage: { width: number; height: number },
): View {
  const scale = Math.min(MAX_ZOOM, Math.max(1, view.scale));
  const slackX = Math.max(0, (photo.width * scale - stage.width) / 2);
  const slackY = Math.max(0, (photo.height * scale - stage.height) / 2);
  // `+ 0` folds a -0 from clamping into 0, which reads better in a transform.
  return {
    scale,
    x: Math.min(slackX, Math.max(-slackX, view.x)) + 0,
    y: Math.min(slackY, Math.max(-slackY, view.y)) + 0,
  };
}

/**
 * Rescales about a point, so the bit of the photograph under the fingers
 * (or the cursor) stays under them. `point` is relative to the stage's
 * centre. Not clamped: pinching wants to overshoot and settle, so the
 * caller clamps when it is ready to.
 */
export function zoomAbout(
  view: View,
  scale: number,
  point: { x: number; y: number },
): View {
  const k = scale / view.scale;
  return {
    scale,
    x: point.x - (point.x - view.x) * k,
    y: point.y - (point.y - view.y) * k,
  };
}
