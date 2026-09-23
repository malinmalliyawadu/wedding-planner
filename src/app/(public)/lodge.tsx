/**
 * The venue, drawn.
 *
 * Pencarrow Lodge, seen from the ceremony lawn: a long, low house under
 * an iron roof, a veranda the length of it on square posts, a gabled
 * wing standing proud on the left, two chimney stacks, and behind it the
 * pines and the tussock hills of the coast, with the sea and the far
 * headland off to the right. It is the vignette an engraved letterhead
 * carries at its head - the house, and enough of where it stands to say
 * which house - and it is drawn in the same fine brass line as the
 * sprig, because a photograph on stationery reads as a website and a
 * watercolour of a building reads as a greeting card.
 *
 * Tone is hatching, as it would be on the plate: parallel lines clipped
 * to each face, closer together where it is darker. Nothing is filled.
 * The hills run *behind* the house, so they are clipped out of its
 * silhouette rather than painted over with paper - the face sits on
 * `wash`, and a paper-coloured fill would show as a lighter patch on a
 * washed sheet.
 *
 * Deterministic, like `sprig.tsx` and `wax-seal.tsx`: the hatching is
 * computed but nothing is random, so the server and client agree. It
 * does **not** draw itself on like the ornament - this is far more line
 * than 170px of sprig, and animating `stroke-dashoffset` over it would
 * be the repaint the note in `globals.css` warns against. It rises with
 * the type instead.
 *
 * It is a drawing of one particular building, so it only appears when
 * the settings say the wedding is there (`isVenueDrawn`). Change the
 * venue and it goes, rather than standing in for somewhere it is not.
 */

export function isVenueDrawn(venueName: string | null | undefined): boolean {
  return /pencarrow/i.test(venueName ?? "");
}

type Pt = readonly [number, number];

const r2 = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * Parallel lines at `angle` degrees, `spacing` apart, clipped to a
 * simple polygon. Each line is intersected with every edge and the
 * crossings paired off in order, so a concave face hatches correctly
 * too. Returns one path so a face is a single element.
 */
function hatch(poly: readonly Pt[], spacing: number, angle: number, phase = spacing / 2): string {
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  // The normal, along which the lines are spaced.
  const nx = -dy;
  const ny = dx;
  const offsets = poly.map(([x, y]) => x * nx + y * ny);
  const tMin = Math.min(...offsets);
  const tMax = Math.max(...offsets);
  const parts: string[] = [];
  for (let t = tMin + phase; t < tMax; t += spacing) {
    const hits: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      const ta = ax * nx + ay * ny;
      const tb = bx * nx + by * ny;
      if ((ta - t) * (tb - t) >= 0) continue;
      const u = (t - ta) / (tb - ta);
      const px = ax + (bx - ax) * u;
      const py = ay + (by - ay) * u;
      hits.push(px * dx + py * dy);
    }
    hits.sort((p, q) => p - q);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const s0 = hits[i];
      const s1 = hits[i + 1];
      parts.push(
        `M ${r2(nx * t + dx * s0)} ${r2(ny * t + dy * s0)} L ${r2(nx * t + dx * s1)} ${r2(ny * t + dy * s1)}`,
      );
    }
  }
  return parts.join(" ");
}

const poly = (pts: readonly Pt[]) => pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" L ");

/* ------------------------------------------------------------------ *
 * The house. A light three-quarter view from the right, so the end
 * wall and the wing's side show and the roof reads as a roof: lines
 * that run away from the viewer go a little to the right, up below
 * the eaves and down above them.
 * ------------------------------------------------------------------ */

/** The pitch, as the direction a barge board runs. Every roof face is hatched along it. */
const PITCH = (Math.atan2(-11.5, 4) * 180) / Math.PI;

const MAIN_ROOF: Pt[] = [[62, 45.5], [200, 45.5], [203, 34], [66, 34]];
const VERANDA_ROOF: Pt[] = [[70, 46.4], [199, 46.4], [199, 53], [70, 53]];
const VERANDA_SHADE: Pt[] = [[70, 53.9], [199, 53.9], [199, 58.8], [70, 58.8]];
const END_WALL: Pt[] = [[198, 45.8], [208, 44.2], [208, 67.2], [198, 70]];
const END_GABLE: Pt[] = [[200, 45.5], [208, 43.8], [203, 34]];
const POSTS = [74, 92, 110, 128, 146, 164, 182, 197];

/** The wing's gable: y on the barge board at x. */
const barge = (x: number) => 42.4 + Math.abs(x - 44) * 0.472;
const WING_SIDE: Pt[] = [[66, 53.9], [70, 53.4], [70, 69], [66, 70]];
/**
 * The wing's roof: the slope that faces the viewer, a band along the
 * barge from the apex back to the main wall. Its ridge recedes too
 * little at this angle to show, and drawing it was tried - a peak
 * behind the gable reads as a kink in the roofline, not as depth.
 */
const WING_ROOF: Pt[] = [[44, 42.4], [47.5, 41.6], [66, 50.4], [66, 52.8]];
const WING_WINDOWS: ReadonlyArray<readonly [number, number]> = [[29.5, 38.5], [49.5, 58.5]];

function Chimney({ x, top }: { x: number; top: number }) {
  const front: Pt[] = [[x, top + 2.2], [x + 6.5, top + 2.2], [x + 6.5, 34], [x, 34]];
  const side: Pt[] = [[x + 6.5, top + 2.2], [x + 9, top + 1.8], [x + 9, 33.6], [x + 6.5, 34]];
  const cap: Pt[] = [[x - 0.8, top], [x + 7.3, top], [x + 7.3, top + 2.2], [x - 0.8, top + 2.2]];
  const capSide: Pt[] = [[x + 7.3, top], [x + 9.8, top - 0.4], [x + 9.8, top + 1.8], [x + 7.3, top + 2.2]];
  return (
    <>
      <path d={`M ${poly(front)} Z M ${poly(cap)} Z`} />
      <path d={`M ${poly(side)} Z M ${poly(capSide)} Z`} />
      {/* The courses, faint, on the lit face; dense on the shaded side. */}
      <path d={hatch(front, 2.2, 0)} strokeWidth="0.35" strokeOpacity="0.3" />
      <path d={hatch(side, 1.1, 90)} strokeWidth="0.4" strokeOpacity="0.5" />
      <path d={hatch(capSide, 1.1, 90)} strokeWidth="0.4" strokeOpacity="0.5" />
    </>
  );
}

function Wing() {
  const boards: string[] = [];
  for (let x = 25; x <= 65; x += 4) {
    const top = barge(x) + 1.4;
    const window = WING_WINDOWS.find(([l, r]) => x > l && x < r);
    boards.push(window ? `M ${x} ${r2(top)} V 56 M ${x} 66.6 V 70` : `M ${x} ${r2(top)} V 70`);
  }
  return (
    <>
      {/* The wall, under the fascia, and its boards. */}
      <path d={`M 22 ${r2(barge(22) + 1.1)} V 70 H 66 V ${r2(barge(66) + 1.1)}`} />
      <path d={boards.join(" ")} strokeWidth="0.4" strokeOpacity="0.32" />
      {/* Barge board and fascia, the two lines of a gable's edge. */}
      <path d="M 19 54.2 L 44 42.4 L 69 54.2" strokeWidth="0.9" />
      <path d="M 19.6 55.3 L 44 43.5 L 68.4 55.3" strokeWidth="0.5" strokeOpacity="0.6" />
      {WING_WINDOWS.map(([l, r]) => {
        const glass: Pt[] = [[l, 56], [r, 56], [r, 66], [l, 66]];
        const mid = (l + r) / 2;
        return (
          <g key={l}>
            <path d={`M ${l} 56 H ${r} V 66 H ${l} Z M ${mid} 56 V 66 M ${l} 60.5 H ${r}`} strokeWidth="0.6" />
            <path d={hatch(glass, 1.7, -50)} strokeWidth="0.35" strokeOpacity="0.3" />
            <path d={`M ${l - 0.8} 66.6 H ${r + 0.8}`} strokeWidth="0.7" />
          </g>
        );
      })}
      {/* The side that faces away from the light, and the roof slope above it. */}
      <path d={`M ${poly(WING_SIDE)} Z`} strokeWidth="0.6" />
      <path d={hatch(WING_SIDE, 1.4, 90)} strokeWidth="0.4" strokeOpacity="0.5" />
      <path d="M 44 42.4 L 47.5 41.6 L 66 50.4" strokeWidth="0.6" />
      <path d={hatch(WING_ROOF, 2.4, 25.3)} strokeWidth="0.4" strokeOpacity="0.35" />
    </>
  );
}

function House() {
  const glazing: string[] = [];
  for (let x = 76; x < 197; x += 5.5) glazing.push(`M ${r2(x)} 59.9 V 69.4`);
  return (
    <g fill="none" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round">
      {/* The main roof: ridge, eave, the barges at each end, the far barge. */}
      <path d="M 66 34 H 203 M 62 45.5 L 66 34 M 200 45.5 L 203 34 M 203 34 L 208 43.8 M 200 45.5 L 208 43.8" />
      <path d="M 62 45.5 H 200" strokeWidth="0.9" />
      <path d="M 62.4 46.4 H 199.6" strokeWidth="0.45" strokeOpacity="0.6" />
      <path d={hatch(MAIN_ROOF, 3.4, PITCH)} strokeWidth="0.42" strokeOpacity="0.42" />

      {/* The end wall, in shade. */}
      <path d={`M ${poly(END_WALL)} Z`} />
      <path d={hatch(END_WALL, 1.9, 90)} strokeWidth="0.4" strokeOpacity="0.45" />
      <path d={hatch(END_GABLE, 1.9, 90)} strokeWidth="0.4" strokeOpacity="0.45" />

      {/* The veranda: its lean-to roof, the shadow under it, the glazed
          wall behind, the posts, the deck. */}
      <path d={hatch(VERANDA_ROOF, 3.4, PITCH, 1.7)} strokeWidth="0.42" strokeOpacity="0.38" />
      <path d="M 70 53 H 199" strokeWidth="0.9" />
      <path d="M 70.4 53.9 H 198.6" strokeWidth="0.45" strokeOpacity="0.6" />
      <path d={hatch(VERANDA_SHADE, 1.35, 50)} strokeWidth="0.42" strokeOpacity="0.5" />
      <path d={glazing.join(" ")} strokeWidth="0.35" strokeOpacity="0.28" />
      <path d="M 70.5 59.4 H 198.5" strokeWidth="0.4" strokeOpacity="0.35" />
      <path d={POSTS.map((x) => `M ${x - 0.75} 53.9 V 70 M ${x + 0.75} 53.9 V 70`).join(" ")} strokeWidth="0.6" />
      <path d="M 70 68.5 H 198" strokeWidth="0.45" strokeOpacity="0.45" />
      <path d="M 70 70 H 198" strokeWidth="0.8" />

      <Chimney x={73} top={23} />
      <Chimney x={185} top={25} />

      <Wing />
    </g>
  );
}

/* ------------------------------------------------------------------ *
 * Where it stands.
 * ------------------------------------------------------------------ */

/**
 * The house's outline against the sky and the ground, as a hole in
 * the landscape's clip. Chimneys included: a hill line running through
 * a stack is the first thing an eye catches.
 */
const SILHOUETTE =
  "M 0 0 H 240 V 100 H 0 Z " +
  "M 19 54.2 L 44 42.4 L 47.5 41.6 L 66 50.4 L 66 45.5 L 62 45.5 L 66 34 L 72.2 34 L 72.2 23 L 82.8 22.6 L 82.8 34 " +
  "L 184.2 34 L 184.2 25 L 194.8 24.6 L 194.8 34 L 203 34 L 208 43.8 L 208 67.2 L 198 70 L 22 70 L 22 53.3 Z";

/** A radiata pine: tiers of zigzag, and a trunk. */
function pine(x: number, top: number, h: number): string {
  const w = h * 0.42;
  const tiers = 4;
  const left: string[] = [];
  const right: string[] = [];
  for (let k = 1; k <= tiers; k++) {
    const y = top + (h * k) / tiers;
    const wk = (w * k) / tiers;
    left.push(`L ${r2(x - wk)} ${r2(y)} L ${r2(x - wk * 0.6)} ${r2(y)}`);
    right.unshift(`L ${r2(x + wk * 0.6)} ${r2(y)} L ${r2(x + wk)} ${r2(y)}`);
  }
  return `M ${x} ${top} ${left.join(" ")} ${right.join(" ")} Z M ${x} ${r2(top + h)} V ${r2(top + h + 2.5)}`;
}

/** A tussock: five blades fanning from one root, the outer ones shorter. */
function tuft(x: number, y: number, size: number): string {
  const blades: string[] = [];
  for (let i = -2; i <= 2; i++) {
    const a = ((-90 + i * 24) * Math.PI) / 180;
    const len = size * (1 - Math.abs(i) * 0.14);
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    // Bowed outward a touch, so they are blades and not spokes.
    const cx = x + Math.cos(a) * len * 0.55 + i * 0.35;
    const cy = y + Math.sin(a) * len * 0.6;
    blades.push(`M ${x} ${y} Q ${r2(cx)} ${r2(cy)} ${r2(ex)} ${r2(ey)}`);
  }
  return blades.join(" ");
}

const TUFTS: ReadonlyArray<readonly [number, number, number]> = [
  [6, 73.5, 4], [15, 76.5, 3.4], [30, 74, 3.2], [48, 78, 4], [66, 75, 3],
  [90, 78.5, 3.6], [112, 74.5, 3], [134, 79, 4.2], [156, 75.5, 3.2],
  [176, 78.5, 3.8], [196, 74.5, 3], [214, 71, 3.4], [228, 68, 3.2],
  [238, 65, 2.6], [223, 55.2, 2.2], [234, 56.4, 2],
];

/** The ground to the right of the house, rising to the horizon as it goes. */
const groundRight = (x: number) => 67.2 - (x - 208) * 0.144;

function Fence() {
  const posts = [212, 221, 230, 239];
  const post = posts.map((x) => `M ${x} ${r2(groundRight(x))} V ${r2(groundRight(x) - 5.6)}`).join(" ");
  const rails = [1.2, 3.4]
    .map((drop) =>
      posts
        .slice(0, -1)
        .map((x, i) => `M ${x} ${r2(groundRight(x) - 5.6 + drop)} L ${posts[i + 1]} ${r2(groundRight(posts[i + 1]) - 5.6 + drop)}`)
        .join(" "),
    )
    .join(" ");
  return (
    <>
      <path d={post} strokeWidth="0.7" />
      <path d={rails} strokeWidth="0.45" strokeOpacity="0.7" />
    </>
  );
}

function Sea() {
  const rows: Array<[number, number, number]> = [[45.1, 209.5, 0], [47.3, 209.5, 3], [49.4, 210.5, 1]];
  const dashes = rows
    .flatMap(([y, from, offset]) => {
      const out: string[] = [];
      for (let x = from + offset; x < 239; x += 6.5) out.push(`M ${r2(x)} ${y} H ${r2(Math.min(x + 3.2, 240))}`);
      return out;
    })
    .join(" ");
  return (
    <>
      {/* The horizon, the far headland sitting on it, the water. */}
      <path d="M 216 43.2 H 240" strokeWidth="0.55" strokeOpacity="0.6" />
      <path d="M 216 43.2 C 222 39.6, 231 38.4, 240 39.6" strokeWidth="0.6" strokeOpacity="0.7" />
      <path d={dashes} strokeWidth="0.45" strokeOpacity="0.5" />
      {/* The edge of the lawn, where the land drops to the beach. */}
      <path d="M 208 51 C 220 51.6, 230 52.8, 240 53.8" strokeWidth="0.6" strokeOpacity="0.6" />
    </>
  );
}

function Hills() {
  return (
    <>
      <path
        d="M 0 33 C 18 24, 40 20.5, 62 25 C 84 29.5, 100 21, 126 22 C 148 23, 162 29, 180 31 C 194 33, 204 38.5, 216 43.2"
        strokeWidth="0.7"
        strokeOpacity="0.8"
      />
      <path d="M 0 39.5 C 16 32, 34 29.5, 52 33.5 S 66 36, 76 35" strokeWidth="0.6" strokeOpacity="0.65" />
      {/* A few strokes down the flanks, the way a burin suggests a slope. */}
      <path
        d="M 14 30 q -5 2.5 -9 5 M 22 27.5 q -5 2.2 -9 5 M 30 25.6 q -4 2 -8 4.5
           M 96 26.5 q 5 -1.5 10 -2 M 100 24.5 q 4 -1 8 -1.4
           M 150 26 q 6 1 10 3 M 160 27 q 5 1.2 8 3.2 M 168 29 q 5 1 8 2.6
           M 8 36.5 q -4 2 -7 3.6 M 44 31.4 q -4 1.6 -7 3.2"
        strokeWidth="0.45"
        strokeOpacity="0.45"
      />
      <path d={`${pine(5, 36, 20)} ${pine(12, 33, 23)} ${pine(18.5, 38, 18)}`} strokeWidth="0.55" strokeOpacity="0.75" />
    </>
  );
}

export function Lodge({
  className = "",
  idPrefix,
}: {
  className?: string;
  /** Unique per instance: the clip and the mask need ids. */
  idPrefix: string;
}) {
  const clipId = `${idPrefix}-sky`;
  const maskId = `${idPrefix}-edge`;
  const fadeId = `${idPrefix}-fade`;
  return (
    <svg viewBox="0 19 240 63" className={className} role="presentation" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <path d={SILHOUETTE} clipRule="evenodd" />
        </clipPath>
        {/* The vignette's edges: the scene thins away at either side
            rather than being cut off square, as a plate is wiped. */}
        <linearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.1" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.9" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={maskId}>
          <rect x="0" y="0" width="240" height="100" fill={`url(#${fadeId})`} />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <g
          clipPath={`url(#${clipId})`}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Hills />
          <Sea />
        </g>
        <House />
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 0 70 H 22" strokeWidth="0.6" strokeOpacity="0.5" />
          <path d="M 208 67.2 L 240 62.6" strokeWidth="0.6" strokeOpacity="0.5" />
          <Fence />
          <path d={TUFTS.map(([x, y, s]) => tuft(x, y, s)).join(" ")} strokeWidth="0.45" strokeOpacity="0.7" />
        </g>
      </g>
    </svg>
  );
}
