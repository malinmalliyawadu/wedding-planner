"use client";

import { Galaxy } from "./galaxy";

/** The room's own lights, so the stars are of a piece with the ball and the buttons. */
const STARS = ["#fbf4ea", "#f3d9a4", "#f2a7b4", "#e3d6ff"];

/**
 * The light the room is lit by: what is playing, blurred huge, with the
 * starfield drifting over it, and the whole of it going to black at the
 * top and bottom (`dance-room::after`) so that it meets the phone's own
 * black under the notch and the home indicator rather than stopping in
 * a band.
 *
 * With no cover it is the stars alone on the night. A wash of colour
 * standing in for the cover was tried and read as haze.
 *
 * The stars are pointer-free on purpose. Every tap here is on a button
 * - a vote, a request - and a field that warped or swerved under each
 * one would be answering the wrong thing.
 */
export function Room({ coverUrl }: { coverUrl: string | null }) {
  return (
    <div className="dance-room" aria-hidden>
      {coverUrl && (
        <div key={coverUrl} className="dance-glow">
          {/* eslint-disable-next-line @next/next/no-img-element -- the catalogue's CDN; `/_next/image` is not public */}
          <img src={coverUrl} alt="" referrerPolicy="no-referrer" decoding="async" />
        </div>
      )}
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
