/**
 * The seal: a blot of wax with the couple's initials struck into it.
 *
 * Everything is drawn deterministically from the arrays below rather than
 * from a random source, because this renders on the server and again on
 * the client and the two have to agree exactly. Hand-pressed irregularity
 * without randomness is the whole trick - a perfect circle reads as a
 * button, and a circle that moves between renders is a hydration error.
 *
 * What makes it read as wax rather than a maroon disc is the lighting
 * being *inverted* between the two surfaces. The blot is domed, so it is
 * lit from the upper left. The die has pressed a flat recess into it, so
 * that face is lit from the lower right. The monogram then stands proud
 * of the recess and is lit like the dome again. Get those three the same
 * way round and the whole thing collapses into a sticker.
 */

const SIZE = 200;
const CENTRE = SIZE / 2;

/**
 * Radii around the blot, as a fraction of the nominal 78px. Wax squeezes
 * out further on one side than the other under a press that is never
 * quite square, so these vary more than a wobble.
 */
const RADII = [
  1.0, 0.94, 1.05, 0.92, 1.04, 0.97, 1.07, 0.93, 1.0, 1.06, 0.95, 1.02,
].map((factor) => factor * 76);

/**
 * Where the wax gives when the seal is broken. Not a straight line: wax
 * cracks along its own faults, and a ruler-straight split would give the
 * whole thing away as two divs.
 */
const CRACK: ReadonlyArray<readonly [number, number]> = [
  [100, 0],
  [93, 29],
  [107, 57],
  [96, 85],
  [109, 113],
  [95, 141],
  [104, 169],
  [99, 200],
];

/** Round the polygon through its edge midpoints into a blot. */
function blotPath(scale = 1): string {
  const count = RADII.length;
  const vertex = (i: number): [number, number] => {
    const angle = ((i % count) / count) * Math.PI * 2 - Math.PI / 2;
    const radius = RADII[i % count] * scale;
    return [
      CENTRE + Math.cos(angle) * radius,
      CENTRE + Math.sin(angle) * radius,
    ];
  };
  const midpoint = (i: number): [number, number] => {
    const [x1, y1] = vertex(i);
    const [x2, y2] = vertex(i + 1);
    return [(x1 + x2) / 2, (y1 + y2) / 2];
  };
  const round = (n: number) => n.toFixed(2);

  const [startX, startY] = midpoint(count - 1);
  let d = `M ${round(startX)} ${round(startY)}`;
  for (let i = 0; i < count; i++) {
    const [cx, cy] = vertex(i);
    const [mx, my] = midpoint(i);
    d += ` Q ${round(cx)} ${round(cy)} ${round(mx)} ${round(my)}`;
  }
  return `${d} Z`;
}

/**
 * The initials are tucked into each other. Note the optical correction
 * that goes with it: SVG applies letter-spacing after the *last* glyph
 * too, and `text-anchor: middle` centres that phantom gap along with the
 * letters - so a negative value visibly shoves the monogram right unless
 * half of it is taken back off the x.
 */
const LETTER_SPACING = -9;
const MONOGRAM_X = CENTRE - LETTER_SPACING / 2;

const BLOT = blotPath();
/** The die's footprint: smaller than the blot, and not concentric with it. */
const DIE = blotPath(0.76);
const CRACK_LINE = CRACK.map(([x, y]) => `${x} ${y}`).join(" L ");

export function WaxSeal({
  initialA,
  initialB,
  idPrefix = "seal",
}: {
  initialA: string;
  initialB: string;
  /** Ids must be unique per document when the seal appears twice. */
  idPrefix?: string;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-full w-full overflow-visible"
      aria-hidden
    >
      <defs>
        {/* Domed: lit from the upper left, like anything on a desk. */}
        <radialGradient id={id("dome")} cx="33%" cy="26%" r="82%">
          <stop offset="0%" stopColor="var(--color-wax-lit)" />
          <stop offset="52%" stopColor="var(--color-wax)" />
          <stop offset="100%" stopColor="var(--color-wax-shadow)" />
        </radialGradient>

        {/* Recessed: the same light, so the shading runs the other way. */}
        <radialGradient id={id("recess")} cx="72%" cy="78%" r="86%">
          <stop offset="0%" stopColor="var(--color-wax-lit)" stopOpacity="0.9" />
          <stop offset="45%" stopColor="var(--color-wax)" />
          <stop offset="100%" stopColor="var(--color-wax-shadow)" />
        </radialGradient>

        {/* The wet sheen wax keeps as it sets. */}
        <radialGradient id={id("sheen")} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>

        <clipPath id={id("left")}>
          <path d={`M ${CRACK_LINE} L 0 ${SIZE} L 0 0 Z`} />
        </clipPath>
        <clipPath id={id("right")}>
          <path d={`M ${CRACK_LINE} L ${SIZE} ${SIZE} L ${SIZE} 0 Z`} />
        </clipPath>
      </defs>

      {[
        { half: "left", clip: id("left") },
        { half: "right", clip: id("right") },
      ].map(({ half, clip }) => (
        <g key={half} className={`wax-${half}`} clipPath={`url(#${clip})`}>
          <path
            d={BLOT}
            fill={`url(#${id("dome")})`}
            stroke="var(--color-wax-shadow)"
            strokeWidth="1.25"
            strokeOpacity="0.55"
          />
          <path d={DIE} fill={`url(#${id("recess")})`} />
          {/* The lip the die leaves where it cut into the dome. */}
          <path
            d={DIE}
            fill="none"
            stroke="var(--color-wax-shadow)"
            strokeWidth="2.5"
            strokeOpacity="0.42"
          />
          <ellipse
            cx="72"
            cy="62"
            rx="46"
            ry="34"
            fill={`url(#${id("sheen")})`}
            transform="rotate(-28 72 62)"
          />

          {/* The monogram stands proud of the recess, so it is lit like
              the dome: shadow cast down and right, highlight up and left. */}
          <text
            x={MONOGRAM_X + 1.6}
            y={CENTRE + 1.6}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-display select-none"
            fontSize="60"
            letterSpacing={LETTER_SPACING}
            fill="var(--color-wax-shadow)"
          >
            {initialA}
            {initialB}
          </text>
          <text
            x={MONOGRAM_X}
            y={CENTRE}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-display select-none"
            fontSize="60"
            letterSpacing={LETTER_SPACING}
            fill="var(--color-wax-lit)"
          >
            {initialA}
            {initialB}
          </text>
        </g>
      ))}
    </svg>
  );
}
