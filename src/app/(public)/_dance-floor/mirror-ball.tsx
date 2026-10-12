/**
 * The mirror ball, for when there is no cover to show.
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

/**
 * The ball is the CSS 3D disco ball from Bojan's pen
 * (codepen.io/bojan-c/pen/VxbLmX): square mirrors laid on a sphere in
 * bands of latitude, the whole thing turning on its wire, each mirror
 * dimming and catching on its own beat. Changed from the pen in three
 * ways: the scatter is hashed rather than random, the tiles are the
 * room's silver with the odd champagne, rose or lilac one rather than
 * grey, and every length is a fraction of the ball's width (`cqw`), so
 * one drawing serves a hero, an empty state and a 52px list row.
 */
type Tile = { i: number; l: number; d: number; tint: string | null };
type Band = { lat: number; step: number; tiles: Tile[] };

const BALL_TINTS = ["champagne", "rose", "lilac"];

function bands(count: number): Band[] {
  return Array.from({ length: count }, (_, k) => {
    const lat = -90 + ((k + 0.5) * 180) / count;
    // As many as fit round this latitude at the same pitch as the bands.
    const fit = Math.max(1, Math.floor(2 * count * Math.cos((lat * Math.PI) / 180)));
    // The pen's equator is brighter than the rest: it is the band facing the room.
    const equator = Math.abs(lat) < 16;
    return {
      lat: round(lat),
      step: round(360 / fit),
      tiles: Array.from({ length: fit }, (_, i) => {
        const a = hash(k + 1, i + 1);
        const b = hash(i * 5 + 3, k * 7 + 2);
        return {
          i,
          l: Math.round(equator ? 52 + a * 44 : 40 + a * 30),
          d: round(-b * 2),
          tint: b > 0.94 ? BALL_TINTS[Math.floor(hash(k, i * 11) * BALL_TINTS.length)] : null,
        };
      }),
    };
  });
}

const FINE = bands(20);
const COARSE = bands(10);

/**
 * `coarse` is for a thumbnail: a quarter of the tiles, each twice the
 * size, and no shimmer, because at 52px a mirror is three pixels and a
 * list can hold a dozen of them.
 */
export function MirrorBall({ className = "", coarse = false }: { className?: string; coarse?: boolean }) {
  return (
    <div className={`dance-ball ${coarse ? "dance-ball-coarse" : ""} ${className}`} aria-hidden>
      {/* The wire it hangs from, and the cap it hangs by. */}
      <span className="dance-ball-wire" />
      <span className="dance-ball-cap" />
      <div className="dance-ball-body">
        <span className="dance-ball-core" />
        <div className="dance-ball-spin">
          {(coarse ? COARSE : FINE).map((band) => (
            <div
              key={band.lat}
              className="dance-ball-band"
              style={{ ["--lat" as string]: `${band.lat}deg`, ["--step" as string]: `${band.step}deg` }}
            >
              {band.tiles.map((tile) => (
                <i
                  key={tile.i}
                  data-tint={tile.tint ?? undefined}
                  style={{
                    ["--i" as string]: tile.i,
                    ["--l" as string]: tile.l,
                    ["--d" as string]: `${tile.d}s`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <span className="dance-ball-shade" />
      </div>
      {/* Two four-point glints where the light catches hardest. */}
      <svg viewBox="0 0 100 100" className="dance-ball-glints">
        <Glint x={33} y={38} size={7} />
        <Glint x={58} y={30} size={5} />
      </svg>
    </div>
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

/**
 * Rounded so that a last-digit difference between one engine's `Math.sin`
 * and another's cannot make the server's markup and the client's disagree.
 */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
