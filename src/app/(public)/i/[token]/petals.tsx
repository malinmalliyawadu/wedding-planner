import type { CSSProperties } from "react";

/**
 * A handful of petals let go over the reply once it has been accepted.
 *
 * Confetti is the obvious thing and the wrong register - it is paper
 * shapes in primary colours, and this is a card. These are the sprig's
 * own leaf, in the two sides' colours and the brass, dropped from a
 * little above the seal and drifting as they fall. Two dozen, once, and
 * gone: it should read as a moment, not as weather.
 *
 * Laid out from a table rather than a random source, like everything
 * else on this page that is drawn: the shower has to be the same on the
 * server and the client, and a fixed scatter that has been looked at is
 * better than a random one that has not.
 */
type Petal = {
  /** Where along the top it starts, in percent. */
  x: number;
  /** How far it drifts sideways on the way down, in rem. */
  sway: number;
  /** Turns, in degrees, over the fall. */
  spin: number;
  delay: number;
  /** Fall time, in ms. */
  fall: number;
  scale: number;
  tone: "sage" | "rose" | "brass";
};

const PETALS: readonly Petal[] = [
  { x: 6, sway: 1.4, spin: 260, delay: 0, fall: 2900, scale: 0.9, tone: "sage" },
  { x: 14, sway: -1.1, spin: -200, delay: 220, fall: 3300, scale: 1.1, tone: "rose" },
  { x: 21, sway: 1.8, spin: 320, delay: 90, fall: 2700, scale: 0.8, tone: "brass" },
  { x: 29, sway: -0.8, spin: -150, delay: 400, fall: 3100, scale: 1.0, tone: "sage" },
  { x: 35, sway: 1.2, spin: 180, delay: 160, fall: 3500, scale: 1.2, tone: "rose" },
  { x: 42, sway: -1.6, spin: -280, delay: 30, fall: 2800, scale: 0.85, tone: "sage" },
  { x: 48, sway: 0.9, spin: 240, delay: 520, fall: 3200, scale: 1.05, tone: "brass" },
  { x: 53, sway: -1.3, spin: -190, delay: 260, fall: 2950, scale: 0.95, tone: "rose" },
  { x: 59, sway: 1.7, spin: 300, delay: 120, fall: 3400, scale: 1.15, tone: "sage" },
  { x: 66, sway: -0.7, spin: -230, delay: 460, fall: 2750, scale: 0.8, tone: "rose" },
  { x: 72, sway: 1.1, spin: 170, delay: 340, fall: 3050, scale: 1.0, tone: "brass" },
  { x: 79, sway: -1.5, spin: -260, delay: 60, fall: 3300, scale: 1.1, tone: "sage" },
  { x: 86, sway: 0.8, spin: 210, delay: 580, fall: 2850, scale: 0.9, tone: "rose" },
  { x: 93, sway: -1.2, spin: -180, delay: 200, fall: 3150, scale: 1.0, tone: "sage" },
  { x: 10, sway: 1.5, spin: 290, delay: 700, fall: 3000, scale: 0.75, tone: "rose" },
  { x: 25, sway: -1.0, spin: -220, delay: 640, fall: 3250, scale: 0.95, tone: "brass" },
  { x: 38, sway: 1.3, spin: 250, delay: 820, fall: 2900, scale: 1.05, tone: "rose" },
  { x: 51, sway: -1.7, spin: -310, delay: 760, fall: 3350, scale: 0.85, tone: "sage" },
  { x: 63, sway: 0.7, spin: 160, delay: 900, fall: 3100, scale: 1.1, tone: "sage" },
  { x: 76, sway: -1.4, spin: -240, delay: 680, fall: 2800, scale: 0.9, tone: "rose" },
  { x: 90, sway: 1.0, spin: 200, delay: 860, fall: 3200, scale: 1.0, tone: "brass" },
  { x: 45, sway: -0.9, spin: -170, delay: 980, fall: 3000, scale: 0.8, tone: "rose" },
];

/** The sprig's leaf: two arcs meeting at each end. */
const LEAF = "M 1 6 Q 10 -3.5 19 6 Q 10 15.5 1 6 Z";

export function Petals() {
  return (
    <div className="petals" aria-hidden>
      {PETALS.map((petal, index) => (
        <svg
          key={index}
          viewBox="0 0 20 12"
          className={`petal petal-${petal.tone}`}
          style={
            {
              "--petal-x": `${petal.x}%`,
              "--petal-sway": `${petal.sway}rem`,
              "--petal-spin": `${petal.spin}deg`,
              "--petal-delay": `${petal.delay}ms`,
              "--petal-fall": `${petal.fall}ms`,
              "--petal-scale": petal.scale,
            } as CSSProperties
          }
        >
          <path d={LEAF} />
        </svg>
      ))}
    </div>
  );
}
