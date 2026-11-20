"use client";

import { Galaxy } from "./galaxy";

/** The room's own lights, so the stars are of a piece with the ball and the buttons. */
const STARS = ["#fbf4ea", "#f3d9a4", "#f2a7b4", "#e3d6ff"];

/**
 * The room: the starfield drifting on the night, going to black at the
 * top and bottom (`dance-room::after`) so that it meets the phone's own
 * black under the notch and the home indicator rather than stopping in
 * a band.
 *
 * The playing cover used to light it, blurred huge behind the stars. It
 * was cut: under a shader that redraws every frame, iOS Safari re-ran
 * that blur every frame as well, and the page stuttered whenever a song
 * was on. A wash of colour in its place was tried before that and read
 * as haze.
 *
 * The stars are pointer-free on purpose. Every tap here is on a button
 * - a vote, a request - and a field that warped or swerved under each
 * one would be answering the wrong thing.
 */
export function Room() {
  return (
    <div className="dance-room" aria-hidden>
      <Galaxy
        className="dance-stars"
        starColors={STARS}
        density={1}
        glowIntensity={0.3}
        flareIntensity={1}
        starSpeed={0.5}
        mouseInteraction={false}
        mouseRepulsion={false}
        clickWarp={false}
      />
    </div>
  );
}
