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

/** The page's own night: the browser's bars match it, and the notch is ours to pad around. */
export const danceViewport: Viewport = {
  themeColor: "#17121f",
  colorScheme: "dark",
  viewportFit: "cover",
};

export function DanceFloorScreen(props: ComponentProps<typeof Floor>) {
  return (
    <div className={`${display.variable} dance flex flex-col`}>
      {/*
       * The document behind the page is the invitation's paper; without
       * this, pulling past the top or bottom on a phone flashes ivory.
       */}
      <style>{"html,body{background-color:#17121f}"}</style>
      <Floor {...props} />
    </div>
  );
}
