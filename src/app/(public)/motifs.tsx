/**
 * The emblems that sit at the heart of a section's ornament.
 *
 * Drawn, for the same reason `sprig.tsx` is drawn: this page's line
 * vocabulary is a fine, even, lapidary stroke, and the wedding
 * iconography that comes in clip-art packs is almost always a felt-tip
 * doodle - thick, wobbly, cheerful, and instantly at odds with Marcellus
 * and a watercolour corner. The subjects are the same ones every set
 * has; only the hand is different.
 *
 * Each is drawn in its own 24x24 box with no stroke width set, so the
 * caller decides the weight and the colour and one motif works at the
 * head of a section and inside a sentence.
 */

export const MOTIF_NAMES = [
  "rings",
  "glasses",
  "cake",
  "camera",
  "gift",
] as const;

export type MotifName = (typeof MOTIF_NAMES)[number];

/** Two bands, interlocked - the same idea as the app's own icon. */
function Rings() {
  return (
    <>
      <circle cx="9.4" cy="14.6" r="6.4" pathLength={1} data-draw />
      <circle cx="15.4" cy="14.6" r="6.4" pathLength={1} data-draw />
      {/* The stone, set on the near band. */}
      <path d="M 15.4 8.2 L 17.1 5.6 L 18.8 8.2 L 17.1 10.1 Z" pathLength={1} data-draw />
    </>
  );
}

/**
 * A pair of flutes, clinking. The toast, not the drink - which is why
 * they are tilted towards each other and meet at the rim: two upright
 * glasses side by side read as glassware, and this has to read as a
 * moment.
 */
function Glasses() {
  const flute = (
    <>
      {/* A wide rim narrowing to the stem, which is the whole silhouette
          of a flute; too narrow at the top and it reads as a test tube. */}
      <path d="M 6.7 3.4 L 13.3 3.4 L 11.5 11.6 Q 10 13.7 8.5 11.6 Z" pathLength={1} data-draw />
      <path d="M 10 13.7 L 10 19.9" pathLength={1} data-draw />
      <path d="M 7.2 20.4 L 12.8 20.4" pathLength={1} data-draw />
    </>
  );
  return (
    <>
      <g transform="rotate(-16 10 20.4) translate(-2.1 0)">{flute}</g>
      <g transform="rotate(16 14 20.4) translate(5.3 0)">{flute}</g>
    </>
  );
}

/** Three tiers on a stand, with one candle. */
function Cake() {
  return (
    <>
      <path d="M 4.6 18.6 L 4.6 15.2 L 19.4 15.2 L 19.4 18.6 Z" pathLength={1} data-draw />
      <path d="M 6.6 15.2 L 6.6 11.8 L 17.4 11.8 L 17.4 15.2" pathLength={1} data-draw />
      <path d="M 8.6 11.8 L 8.6 8.6 L 15.4 8.6 L 15.4 11.8" pathLength={1} data-draw />
      {/* The stand: a stem and a foot, so it is not a stack of boxes. */}
      <path d="M 12 18.6 L 12 20.4" pathLength={1} data-draw />
      <path d="M 8.4 21 Q 12 19.4 15.6 21" pathLength={1} data-draw />
      <path d="M 12 8.6 L 12 6.2" pathLength={1} data-draw />
      <circle cx="12" cy="5.1" r="0.9" pathLength={1} data-draw />
    </>
  );
}

/** For the album. A body, a lens, and the bump over the viewfinder. */
function Camera() {
  return (
    <>
      <path
        d="M 4.4 8.8 L 8.2 8.8 L 9.6 6.6 L 14.4 6.6 L 15.8 8.8 L 19.6 8.8
           Q 20.8 8.8 20.8 10 L 20.8 17.4 Q 20.8 18.6 19.6 18.6
           L 4.4 18.6 Q 3.2 18.6 3.2 17.4 L 3.2 10 Q 3.2 8.8 4.4 8.8 Z" pathLength={1} data-draw />
      <circle cx="12" cy="13.4" r="3.7" pathLength={1} data-draw />
      <circle cx="17.8" cy="10.9" r="0.7" pathLength={1} data-draw />
    </>
  );
}

/** A box, a ribbon and a bow. */
function Gift() {
  return (
    <>
      <path d="M 5.2 11.4 L 5.2 20 L 18.8 20 L 18.8 11.4" pathLength={1} data-draw />
      <path d="M 3.8 8.2 L 20.2 8.2 L 20.2 11.4 L 3.8 11.4 Z" pathLength={1} data-draw />
      <path d="M 12 8.2 L 12 20" pathLength={1} data-draw />
      {/* Two loops meeting where the ribbon does. */}
      <path d="M 12 8.2 C 9.4 8.2 7.6 6.6 8.4 5.2 C 9.1 4 11.2 4.8 12 8.2 Z" pathLength={1} data-draw />
      <path d="M 12 8.2 C 14.6 8.2 16.4 6.6 15.6 5.2 C 14.9 4 12.8 4.8 12 8.2 Z" pathLength={1} data-draw />
    </>
  );
}

const MOTIFS: Record<MotifName, () => React.JSX.Element> = {
  rings: Rings,
  glasses: Glasses,
  cake: Cake,
  camera: Camera,
  gift: Gift,
};

/**
 * One emblem, drawn into a 24x24 box.
 *
 * Every shape carries `pathLength={1}` and `data-draw` of its own rather
 * than inheriting them from the group: `pathLength` is a geometry
 * attribute, so a `<g>` cannot hand it down, and a dash pattern of "1"
 * would then mean one user unit on a 24-unit box - a dotted line instead
 * of a drawn one. Stroked in `currentColor` with no
 * fill: every one of these is a line drawing, and a filled one would sit
 * beside the sprig looking like a different set.
 */
export function Motif({ name }: { name: MotifName }) {
  const Shape = MOTIFS[name];
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Shape />
    </g>
  );
}
