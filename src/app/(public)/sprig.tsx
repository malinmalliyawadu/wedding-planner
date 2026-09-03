import { Motif, type MotifName } from "./motifs";

/**
 * A botanical sprig in gold line, drawn rather than placed.
 *
 * The watercolour corners in `src/assets/florals` carry fine gold line
 * work threaded through the blooms, and this is that vocabulary on its
 * own: a stem, a few pointed leaves, a curled tendril, three seeds. It
 * is the ornament the page repeats, so it had to be drawable at any size
 * and in any weight - which is why it is a path and not a crop. Cutting
 * it out of the artwork was tried and is not possible cleanly: the gold
 * line runs *behind* the painted leaves, so a crop takes green with it.
 *
 * Deterministic, like `wax-seal.tsx` - the geometry is computed but
 * nothing here is random, so the server and the client agree.
 *
 * Drawn once, facing left, and mirrored. Strokes are `currentColor`, so
 * the caller sets the gold.
 */

/**
 * The half is drawn once in x 8..59, y 0..34, and mirrored. How far
 * apart the two halves sit is the only thing that changes when the
 * ornament carries an emblem: the plain one closes up around its
 * lozenge, and the other opens a 26-unit gap for a 24-unit motif.
 */
const H = 34;
const PLAIN_W = 120;
const MOTIF_W = 144;

const r2 = (n: number) => n.toFixed(2);

/**
 * A leaf as two arcs meeting at the tip, bulged either side of the line
 * from base to tip. `width` is the half-thickness at the middle, so the
 * shape stays an almond however far the tip is pushed out.
 */
function leaf(bx: number, by: number, tx: number, ty: number, width: number) {
  const mx = (bx + tx) / 2;
  const my = (by + ty) / 2;
  const dx = tx - bx;
  const dy = ty - by;
  const length = Math.hypot(dx, dy) || 1;
  // The normal to the leaf's own axis, which is what the bulge is on.
  const nx = -dy / length;
  const ny = dx / length;
  return [
    `M ${r2(bx)} ${r2(by)}`,
    `Q ${r2(mx + nx * width)} ${r2(my + ny * width)} ${r2(tx)} ${r2(ty)}`,
    `Q ${r2(mx - nx * width)} ${r2(my - ny * width)} ${r2(bx)} ${r2(by)}`,
  ].join(" ");
}

/**
 * Base and tip of each leaf, alternating above and below the stalk and
 * shortening towards the tendril, the way a real stem tapers.
 */
const LEAVES: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [52.5, 16.6, 46.8, 10.4, 2.05],
  [46.5, 16.1, 42.4, 22.6, 1.95],
  [39.5, 14.5, 34.0, 8.5, 1.9],
  [34.5, 14.2, 30.4, 20.4, 1.75],
  [27.5, 14.3, 22.6, 9.4, 1.55],
];

/** Seeds. Placed off the stalk, never on it, so they read as fruit. */
const SEEDS: ReadonlyArray<readonly [number, number, number]> = [
  [56.2, 19.1, 1.0],
  [49.6, 19.8, 0.9],
  [43.4, 11.6, 0.85],
];

/*
 * Stalk, then a tendril that curls back on itself at the far end.
 *
 * The weights below are set for the size this actually renders at - a
 * little over 120px wide. Much under that and the leaves close up into a
 * smudge, which is why the Ornament sizes it in rem rather than letting
 * it take whatever height a line of text happens to be.
 */
const STALK =
  "M 59 17 C 48.5 17.2 40.5 13.6 30.5 14.3 C 24.5 14.7 19.4 13.1 16.8 10.5";
const TENDRIL =
  "M 16.8 10.5 C 15.2 8.7 16.6 6.4 18.5 7.1 C 20.1 7.7 19.9 10.1 18.0 10.6";

/*
 * `pathLength={1}` on every stroked path is what lets the ornament draw
 * itself: one dash pattern then fits the stalk, a leaf and a tendril
 * alike without the stylesheet knowing how long any of them is. The
 * `data-draw` and `data-seed` hooks are what `.ornament-draw` animates.
 */
function Half() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round">
      <path d={STALK} strokeWidth="1.15" pathLength={1} data-draw />
      <path d={TENDRIL} strokeWidth="0.95" pathLength={1} data-draw />
      {LEAVES.map((l, i) => (
        <path key={i} d={leaf(...l)} strokeWidth="1.05" pathLength={1} data-draw />
      ))}
      {SEEDS.map(([cx, cy, r], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="currentColor"
          stroke="none"
          data-seed
        />
      ))}
    </g>
  );
}

export function Sprig({
  motif,
  className = "",
}: {
  /** An emblem for the centre, in place of the lozenge. */
  motif?: MotifName;
  className?: string;
}) {
  const width = motif ? MOTIF_W : PLAIN_W;
  const mid = width / 2;
  return (
    <svg
      viewBox={`0 0 ${width} ${H}`}
      className={`ornament-draw ${className}`}
      data-reveal=""
      role="presentation"
      aria-hidden
    >
      <Half />
      {/* The same half, flipped about the centre line. */}
      <g transform={`translate(${width} 0) scale(-1 1)`}>
        <Half />
      </g>
      {motif ? (
        // The 24-unit motif box, centred in the gap the two halves leave.
        <g transform={`translate(${mid - 12} ${H / 2 - 12})`}>
          <Motif name={motif} />
        </g>
      ) : (
        /* The lozenge the ornament has always had, kept as the pivot the
           two sprigs grow out of. */
        <rect
          x={mid - 1.6}
          y={H / 2 - 1.6}
          width="3.2"
          height="3.2"
          transform={`rotate(45 ${mid} ${H / 2})`}
          fill="currentColor"
          data-seed
        />
      )}
    </svg>
  );
}
