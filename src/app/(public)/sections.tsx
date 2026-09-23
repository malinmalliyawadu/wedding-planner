import type { ReactNode } from "react";
import bottomLeft from "@/assets/florals/corner-bottom-left.webp";
import bow from "@/assets/sketches/bow.svg";
import candelabra from "@/assets/sketches/candelabra.svg";
import doveRising from "@/assets/sketches/dove-rising.svg";
import doveTurning from "@/assets/sketches/dove-turning.svg";
import heart from "@/assets/sketches/heart.svg";
import ribbon from "@/assets/sketches/ribbon.svg";
import bottomRight from "@/assets/florals/corner-bottom-right.webp";
import topLeft from "@/assets/florals/corner-top-left.webp";
import { Motif, type MotifName } from "./motifs";
import { Sprig } from "./sprig";

/**
 * The invitation's furniture.
 *
 * The planner packs information in; this packs it out. Sections are wide
 * apart, headings are small and quiet above the thing they name, and the
 * repeated motif is the lozenge below, doing the work that a dozen
 * decorations would fight over. The painted corners are the exception,
 * and they are rationed: the first screen and the last, and nowhere in
 * between, so they stay an event rather than a wallpaper.
 */

/**
 * A painted corner.
 *
 * Three watercolour clusters, cut from one sheet of artwork so they
 * agree about light, palette and brush. Two things about them are worth
 * knowing before touching them.
 *
 * **They are not cut out.** Each carries its own wash and is feathered
 * along the two edges that face into the page; the other two bleed off.
 * That is why they have no hard silhouette to give them away - and why
 * they must sit on `wash`, whose colours are sampled from these very
 * files. Put one on plain paper and the feathered edge becomes a visible
 * rectangle of blush.
 *
 * **They go through the bundler, not `public/`.** A static import is
 * emitted under `/_next/static/`, which `isPublicPath` already allows;
 * a file in `public/` would be served from a path the proxy blocks for
 * exactly the guests this page is for. It also means `next/image` is not
 * involved, which matters - `/_next/image` is deliberately not public
 * and must stay that way.
 */
const CLUSTERS = {
  "top-left": { src: topLeft, className: "top-0 left-0" },
  "bottom-left": { src: bottomLeft, className: "bottom-0 left-0" },
  "bottom-right": { src: bottomRight, className: "right-0 bottom-0" },
} as const;

export function FloralCorner({
  at,
  className = "",
}: {
  at: keyof typeof CLUSTERS;
  className?: string;
}) {
  const { src, className: place } = CLUSTERS[at];
  return (
    /*
     * next/image is not available to anything under (public): it serves
     * through /_next/image, which is deliberately absent from the proxy's
     * public allowlist and must stay absent. These are pre-sized static
     * imports instead, emitted under /_next/static, which is allowed.
     */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src.src}
      alt=""
      aria-hidden
      // Decoration under the type, and never in the way of a tap.
      className={`idle-wash pointer-events-none absolute -z-10 select-none ${place} ${className}`}
    />
  );
}

/**
 * A brass sprig. The engraver's full stop.
 *
 * The lozenge that used to sit here is still there, at the centre of the
 * sprig, which is what the two leaf sprays grow out of - the ornament
 * gained a plant rather than being replaced by one. It is the only motif
 * the page repeats, so it is drawn (`sprig.tsx`) rather than placed: it
 * has to hold at the size of a full stop and at the head of a section,
 * and take the brass from whatever it sits in.
 *
 * The hairline rules that used to flank it are gone. They were there to
 * give a lozenge something to break, and the sprig ends in a curled
 * tendril of its own - a flat rule butting into that curl reads as a
 * line that ran out rather than as a finished ornament.
 */
export function Ornament({
  motif,
  className = "",
}: {
  motif?: MotifName;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      aria-hidden
    >
      <Sprig
        motif={motif}
        // The parentheses are not decoration: `+` binds tighter than the
        // conditional, so `"a " + motif ? x : y` concatenates first and
        // then tests a string that is always truthy - which silently
        // drops the class and hands every ornament the motif's sizing.
        className={`idle-breathe ${
          motif
            ? "h-[2.5rem] w-[10.6rem] text-brass-bright sm:h-[3rem] sm:w-[12.7rem]"
            : "h-[2.1rem] w-[7.5rem] text-brass-bright sm:h-[2.8rem] sm:w-[10rem]"
        }`}
      />
    </div>
  );
}

/**
 * Marginalia: a drawn flourish in the white space beside a section.
 *
 * A different hand from the sprig - loose pen-and-ink rather than
 * engraved line - which is the point of using it sparingly. One or two
 * down a long page read as something pressed between the leaves; a dozen
 * would read as a sticker sheet, and would start arguing with the
 * ornament that is doing the actual structural work.
 *
 * Faint and behind the type on purpose. On a phone there is no margin to
 * sit in, so it falls behind the column and behaves as a watermark
 * instead of being cropped away.
 */
const SKETCHES = {
  "dove-rising": doveRising,
  "dove-turning": doveTurning,
  heart,
  ribbon,
  candelabra,
  bow,
} as const;

export type SketchName = keyof typeof SKETCHES;

/**
 * `arrive` is how it gets here: "in" for the ones you scroll to, "now"
 * for the two above the fold, which have nothing to scroll into and so
 * run on a clock instead.
 *
 * Note the wrapper. The arrival and the idle both animate `transform`,
 * and two animations on one property do not compose - the second simply
 * replaces the first. So the span arrives and the image inside it
 * breathes, and neither has to know about the other.
 */
/**
 * What each drawing does once it has arrived. A dove rides, a candle
 * gutters, a ribbon stirs, a heart beats, a hanging bow swings - the
 * motion belongs to the object rather than being one pulse applied to
 * all five, which would read as a screensaver.
 */
const IDLES: Record<SketchName, string> = {
  "dove-rising": "idle-fly",
  "dove-turning": "idle-fly",
  candelabra: "idle-flicker",
  ribbon: "idle-stir",
  heart: "idle-beat",
  bow: "idle-swing",
};

export function Sketch({
  name,
  arrive = "in",
  idle = true,
  className = "",
}: {
  name: SketchName;
  arrive?: "in" | "in-wing" | "in-unfurl" | "now" | "now-wing";
  idle?: boolean;
  className?: string;
}) {
  const arrival = {
    in: "sketch-in",
    "in-wing": "sketch-wing-in",
    "in-unfurl": "sketch-unfurl-in",
    now: "sketch-now",
    "now-wing": "sketch-wing-now",
  }[arrive];
  return (
    <span
      className={`sketch pointer-events-none absolute -z-10 block select-none ${arrival} ${className}`}
      // Only the ones that wait to be scrolled to need the observer; the
      // two above the fold are on a clock and have already arrived.
      data-reveal={arrive.startsWith("in") ? "" : undefined}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SKETCHES[name].src}
        alt=""
        className={`block w-full ${idle ? IDLES[name] : ""}`}
      />
    </span>
  );
}

export function Section({
  id,
  eyebrow,
  title,
  intro,
  motif,
  sketch,
  width = "prose",
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  /**
   * A line under the ornament in the italic the ampersand is set in -
   * the card's own voice, for the sentence that frames what follows.
   */
  intro?: string;
  /**
   * An emblem for this section's ornament. Optional on purpose: a
   * section with nothing obvious to draw gets the lozenge rather than a
   * laboured metaphor, and the page is better for the odd plain one.
   */
  motif?: MotifName;
  /** A flourish in the margin. `side` is which one it hangs off. */
  sketch?: { name: SketchName; side: "left" | "right"; className?: string };
  /** The column: `prose` for words, `wide` for a spread or a gallery. */
  width?: "prose" | "wide";
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      // scroll-mt keeps a heading clear of the ribbon when the section is
      // jumped to from a link rather than scrolled to.
      className={`relative mx-auto w-full scroll-mt-20 px-6 py-16 sm:py-24 ${
        width === "wide" ? "max-w-5xl" : "max-w-3xl"
      }`}
    >
      {sketch && (
        <Sketch
          name={sketch.name}
          arrive={
            sketch.name.startsWith("dove")
              ? "in-wing"
              : sketch.name === "ribbon"
                ? "in-unfurl"
                : "in"
          }
          className={`top-10 ${
            sketch.side === "left"
              ? "left-0 [--sketch-x:-25%] [--wing-from:-1.6rem] sm:[--sketch-x:-50%]"
              : "right-0 [--sketch-x:25%] sm:[--sketch-x:50%]"
          } ${sketch.className ?? "w-[18vw] max-w-[7rem]"}`}
        />
      )}
      <Rise as="header" className="text-center">
        <p className="eyebrow text-brass">{eyebrow}</p>
        <h2 className="mt-3 font-display text-[clamp(1.85rem,6.5vw,2.75rem)] leading-tight text-ink">
          {title}
        </h2>
        <Ornament motif={motif} className="mt-5" />
        {intro && (
          <p className="formula mx-auto mt-5 max-w-lg text-[1.15rem] leading-relaxed text-ink-soft sm:text-[1.25rem]">
            {intro}
          </p>
        )}
      </Rise>
      <div className="mt-10 sm:mt-12">{children}</div>
    </section>
  );
}

/**
 * Something that arrives as you reach it. Blocks of the card rather
 * than marginalia: the strip of facts, a moment of the day, the reply
 * card. Rendered as whatever element the layout needs, with the same
 * `data-reveal` hook the sketches use so there is one fallback path.
 */
export function Rise({
  as: Tag = "div",
  className = "",
  children,
}: {
  as?: "div" | "header" | "li" | "section" | "footer" | "p";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={`rise rise-in ${className}`} data-reveal="">
      {children}
    </Tag>
  );
}

/**
 * The engraved frame: two ruled lines around the names on the card's
 * face, with a lozenge set into each corner of the inner one. It fades
 * up whole with the type. Drawing it on as a stroke was tried and cut:
 * a box caught with two sides missing reads as broken, not as ruled.
 *
 * Two SVGs rather than two rects in one, and the inner one is inset in
 * pixels: a percentage inset on a tall narrow box gives a wider gap at
 * the top than at the sides, which reads as a mistake at phone widths.
 * Each rect sits exactly on its box's edge (`overflow: visible` shows
 * the outer half of the stroke), stroked in screen pixels regardless of
 * how the box is stretched.
 */
export function Frame({ className = "" }: { className?: string }) {
  return (
    <div className={`frame-draw pointer-events-none absolute inset-0 -z-10 text-brass-bright ${className}`} aria-hidden>
      <Rule className="inset-0 size-full" strokeWidth={1} opacity={1} which="outer" />
      <Rule
        className="inset-[7px] h-[calc(100%-14px)] w-[calc(100%-14px)]"
        strokeWidth={0.7}
        opacity={0.8}
        which="inner"
      />
    </div>
  );
}

function Rule({
  className,
  strokeWidth,
  opacity,
  which,
}: {
  className: string;
  strokeWidth: number;
  opacity: number;
  which: "outer" | "inner";
}) {
  return (
    <svg
      // Sized explicitly: an absolutely positioned SVG with `auto` sizes
      // takes its intrinsic 300x150 rather than filling its box, and
      // the frame then stops halfway down the names.
      className={`absolute overflow-visible ${className}`}
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeOpacity={opacity}
        vectorEffect="non-scaling-stroke"
        data-rule={which}
      />
    </svg>
  );
}

/**
 * The lozenges at a frame's corners. An HTML sibling of the SVG rather
 * than a child, because `preserveAspectRatio="none"` would squash a
 * square drawn inside it into whatever shape the box is.
 *
 * Every corner is placed by `left` and `top`, never `right` or `bottom`:
 * the half-size translate centres a box on the point its top-left is
 * anchored to, so a lozenge anchored by its right edge lands a half-width
 * inside the rule's corner instead of on it.
 */
export function FrameCorners() {
  return (
    <div className="frame-draw pointer-events-none absolute inset-0" aria-hidden>
      {[
        "top-[7px] left-[7px]",
        "top-[7px] left-[calc(100%-7px)]",
        "top-[calc(100%-7px)] left-[7px]",
        "top-[calc(100%-7px)] left-[calc(100%-7px)]",
      ].map(
        (place) => (
          <span
            key={place}
            className={`absolute ${place} size-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-brass-bright`}
          />
        ),
      )}
    </div>
  );
}

/**
 * A spread: two columns of the card divided by a vertical hairline,
 * the way a folded programme opens. Replaces the pair of cards that
 * used to sit here - a card is the planner's furniture, and on
 * stationery two boxes side by side read as a website.
 */
export function Spread({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-hairline ${className}`}
    >
      {children}
    </div>
  );
}

/** One leaf of a spread. */
export function Leaf({
  motif,
  eyebrow,
  children,
  className = "",
}: {
  motif?: MotifName;
  eyebrow: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Rise className={`sm:px-10 first:sm:pl-0 last:sm:pr-0 ${className}`}>
      <div className="flex items-center gap-3">
        {motif && (
          <svg
            viewBox="0 0 24 24"
            className="size-6 shrink-0 text-brass-bright"
            aria-hidden
          >
            <Motif name={motif} />
          </svg>
        )}
        <p className="eyebrow text-brass">{eyebrow}</p>
      </div>
      <div className="mt-4">{children}</div>
    </Rise>
  );
}

/** A quiet card for a block of the couple's own words. */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-hairline bg-card p-6 shadow-card sm:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * A labelled paragraph of the couple's prose. Newlines are honoured
 * because the couple type these into a textarea and expect the shape of
 * what they wrote to survive.
 */
export function Prose({ children }: { children: string }) {
  return (
    <p className="text-[1rem] leading-[1.7] whitespace-pre-line text-ink-soft">
      {children}
    </p>
  );
}
