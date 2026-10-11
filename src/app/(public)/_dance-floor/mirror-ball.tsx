/**
 * The mirror ball, drawn, and the light it throws.
 *
 * Deterministic like the wax seal and the sprig: no RNG, because this
 * renders on the server and again on the client, and the two must agree.
 * Where something has to look scattered, it is scattered by a hash of its
 * own position.
 */

/** A stable pseudo-random number in [0, 1) for a pair of integers. */
function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const DEG = Math.PI / 180;
const R = 38;
const CX = 50;
const CY = 54;
/** Light from the upper left and a little in front, as from a spotlight on the rig. */
const LIGHT = (() => {
  const v = [-0.55, 0.62, 0.56];
  const length = Math.hypot(...v);
  return v.map((n) => n / length);
})();

type Facet = { points: string; fill: string };

/**
 * The facets of the front hemisphere, in bands of latitude and longitude,
 * each shaded by how squarely it faces the light. A few that face it
 * well catch it outright and flash champagne - those are what make it a
 * mirror ball rather than a golf ball.
 */
const FACETS: Facet[] = (() => {
  const facets: Facet[] = [];
  const step = 10;
  const project = (lat: number, lon: number) =>
    `${(CX + R * Math.cos(lat * DEG) * Math.sin(lon * DEG)).toFixed(2)},${(CY - R * Math.sin(lat * DEG)).toFixed(2)}`;
  for (let lat = -90; lat < 90; lat += step) {
    for (let lon = -90; lon < 90; lon += step) {
      const midLat = (lat + step / 2) * DEG;
      const midLon = (lon + step / 2) * DEG;
      const normal = [
        Math.cos(midLat) * Math.sin(midLon),
        Math.sin(midLat),
        Math.cos(midLat) * Math.cos(midLon),
      ];
      const lit = Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2]);
      const jitter = hash(lat, lon);
      let fill: string;
      if (lit > 0.55 && jitter > 0.86) {
        fill = jitter > 0.95 ? "#fffaf0" : "#f3d9a4";
      } else {
        // Silver going to the room's own dark at the edges, never to grey.
        const light = Math.round(16 + lit * 58 + (jitter - 0.5) * 14);
        fill = `hsl(268 ${Math.round(10 + lit * 6)}% ${light}%)`;
      }
      facets.push({
        points: [
          project(lat, lon),
          project(lat, lon + step),
          project(lat + step, lon + step),
          project(lat + step, lon),
        ].join(" "),
        fill,
      });
    }
  }
  return facets;
})();

export function MirrorBall({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id="dance-ball-halo" cx="50%" cy="54%" r="50%">
          <stop offset="0%" stopColor="#f3d9a4" stopOpacity="0.28" />
          <stop offset="55%" stopColor="#f2a7b4" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#17121f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dance-ball-sheen" cx="34%" cy="36%" r="60%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id="dance-ball-clip">
          <circle cx={CX} cy={CY} r={R} />
        </clipPath>
      </defs>
      <circle cx={CX} cy={CY} r={48} fill="url(#dance-ball-halo)" />
      {/* The wire it hangs from. */}
      <line x1={CX} y1={0} x2={CX} y2={CY - R} stroke="#fbf4ea" strokeOpacity="0.35" strokeWidth="0.5" />
      <rect x={CX - 2} y={CY - R - 2.2} width={4} height={3} rx={0.6} fill="#3a3046" />
      <g clipPath="url(#dance-ball-clip)">
        <circle cx={CX} cy={CY} r={R} fill="#120e18" />
        {FACETS.map((facet, i) => (
          <polygon key={i} points={facet.points} fill={facet.fill} stroke="#120e18" strokeWidth="0.45" />
        ))}
        <circle cx={CX} cy={CY} r={R} fill="url(#dance-ball-sheen)" />
      </g>
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#fbf4ea" strokeOpacity="0.12" strokeWidth="0.4" />
      {/* Two four-point glints where the light catches hardest. */}
      <Glint x={33} y={38} size={7} />
      <Glint x={58} y={30} size={5} />
    </svg>
  );
}

function Glint({ x, y, size }: { x: number; y: number; size: number }) {
  const s = size / 2;
  const w = size / 9;
  return (
    <path
      className="dance-glint"
      d={`M${x} ${y - s} L${x + w} ${y - w} L${x + s} ${y} L${x + w} ${y + w} L${x} ${y + s} L${x - w} ${y + w} L${x - s} ${y} L${x - w} ${y - w} Z`}
      fill="#fffaf0"
    />
  );
}

type Fleck = { x: number; y: number; w: number; h: number; o: number; tint: string };

const TINTS = ["#ffffff", "#ffffff", "#fff3dc", "#f3d9a4", "#f2a7b4", "#e3d6ff"];

/**
 * One copy of the scatter, as percentages of the strip's half. Elongated
 * a little, as the reflection of a square mirror on a wall is, and laid
 * out by hash so the server and client agree.
 */
function scatter(count: number, seed: number, scale: number): Fleck[] {
  return Array.from({ length: count }, (_, i) => {
    const a = hash(i, seed);
    const b = hash(seed, i * 3 + 1);
    const c = hash(i * 7 + 2, seed + 5);
    const size = (4 + c * 7) * scale;
    return {
      x: round(a * 100),
      y: round(b * 100),
      w: round(size * (1.2 + c * 0.6)),
      h: round(size),
      o: round(0.3 + hash(i + 11, seed * 2) * 0.55),
      tint: TINTS[Math.floor(hash(i, seed + 9) * TINTS.length)],
    };
  });
}

/**
 * Rounded so that a last-digit difference between one engine's `Math.sin`
 * and another's cannot make the server's markup and the client's disagree.
 */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

const NEAR = scatter(18, 3, 1);
const FAR = scatter(28, 17, 0.55);

function Strip({ flecks, className }: { flecks: Fleck[]; className: string }) {
  // Two identical halves, so sliding left by one is seamless.
  return (
    <div className={className}>
      {[0, 50].map((offset) =>
        flecks.map((fleck, i) => (
          <span
            key={`${offset}-${i}`}
            className="dance-fleck"
            style={{
              left: `${offset + fleck.x / 2}%`,
              top: `${fleck.y}%`,
              width: `${fleck.w}px`,
              height: `${fleck.h}px`,
              opacity: fleck.o,
              ["--tint" as string]: fleck.tint,
            }}
          />
        )),
      )}
    </div>
  );
}

/** The light the room is lit by: what is playing, and the ball turning above it. */
export function Room({ coverUrl }: { coverUrl: string | null }) {
  return (
    <div className="dance-room" aria-hidden>
      {coverUrl ? (
        <div key={coverUrl} className="dance-glow">
          {/* eslint-disable-next-line @next/next/no-img-element -- the catalogue's CDN; `/_next/image` is not public */}
          <img src={coverUrl} alt="" referrerPolicy="no-referrer" decoding="async" />
        </div>
      ) : (
        <div className="dance-glow dance-glow-plain" />
      )}
      <Strip flecks={FAR} className="dance-flecks dance-flecks-far" />
      <Strip flecks={NEAR} className="dance-flecks" />
    </div>
  );
}
