import type { Viewport } from "next";
import { Sofia_Sans_Extra_Condensed } from "next/font/google";
import type { ComponentProps } from "react";
import { Floor } from "./floor";
import "./dance-floor.css";

/**
 * The dance floor's page, whichever way the guest came in. Both routes
 * render this with their own credential bound into the actions; nothing
 * on screen differs between them except the way back to an invitation.
 */

/*
 * Song titles are the loudest thing here and some are long ("I Wanna
 * Dance with Somebody (Who Loves Me)"), so they are set in an extra
 * condensed face that can stay large on a phone without breaking every
 * word. Loaded on this page and nowhere else.
 */
const display = Sofia_Sans_Extra_Condensed({
  subsets: ["latin", "latin-ext"],
  variable: "--font-dance",
  display: "swap",
});

/**
 * Black, not the page's night: the room fades to black at the top and
 * bottom (`--edge` in `dance-floor.css`), so the browser's bars, the
 * strip round the notch and the home indicator all meet it with no seam.
 */
export const danceViewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  viewportFit: "cover",
};

export function DanceFloorScreen(props: ComponentProps<typeof Floor>) {
  return (
    <div className={`${display.variable} dance flex flex-col`}>
      {/*
       * The document behind the page is the invitation's paper; without
       * this, pulling past the top or bottom on a phone flashes ivory.
       * Black, to carry on from the room's faded edges.
       */}
      <style>{"html,body{background-color:#000}"}</style>
      <Floor {...props} />
    </div>
  );
}
