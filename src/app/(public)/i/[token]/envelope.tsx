"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import floral from "@/assets/florals/corner-bottom-left.webp";
import { Tilt } from "../../tilt";
import { SEAL_COOKIE_MAX_AGE, sealCookieName } from "./seal-cookie";
import { WaxSeal } from "./wax-seal";

/**
 * The curtain over the invitation.
 *
 * The invitation itself is already rendered underneath this, by the
 * server, in the same HTML - which is what makes the whole flourish
 * optional. No JavaScript, and the <noscript> rule in the layout removes
 * the overlay and the guest reads the card.
 *
 * A returning guest never sees it a second time, because a ceremony you
 * cannot skip stops being one. That is remembered in a cookie rather
 * than localStorage so the *server* can decide not to render the
 * envelope at all: there is no frame in which it flashes up and vanishes
 * again, which is what a client-side check would have cost.
 */

/**
 * The whole sequence, and the last delay + duration in the
 * `[data-seal="broken"]` rules in globals.css. Tear the stage down any
 * earlier and the flap is still moving when it goes.
 */
const OPEN_SEQUENCE_MS = 1400;

/**
 * When the invitation underneath starts coming up - the moment the stage
 * begins to fade, not the moment it finishes. The two are meant to cross:
 * an envelope that vanishes and *then* a page that arrives leaves a blank
 * frame between them, which is the one thing a dissolve is for avoiding.
 */
const REVEAL_AT_MS = 1080;

export function Envelope({
  token,
  addressee,
  address,
  initialA,
  initialB,
}: {
  token: string;
  addressee: string;
  address: string | null;
  initialA: string;
  initialB: string;
}) {
  const [phase, setPhase] = useState<"sealed" | "breaking" | "gone">("sealed");
  const stageRef = useRef<HTMLDivElement>(null);
  // A ref rather than the phase, so a second tap in the same frame as
  // the first - a double tap, or the seal's own click bubbling up to
  // the stage - cannot start the sequence twice.
  const struck = useRef(false);
  // Whether it was a pointer that opened it. The seal is focused by
  // script the moment the stage mounts, before the guest has touched
  // anything, so Chrome treats that focus as keyboard-driven and draws
  // the ring - and carries the ring across to wherever a script moves
  // focus next. A guest who tapped or clicked would otherwise end the
  // ceremony looking at a brass box around the couple's names.
  const byPointer = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  /**
   * Hands the page back. Idempotent: the sequence fires it part way
   * through so the two cross, and Skip and Escape fire it on their way
   * out, when there is nothing left to cross with.
   */
  const reveal = useCallback(() => {
    const main = document.getElementById("main");
    if (main) main.dataset.envelope = "opened";
  }, []);

  const dismiss = useCallback(() => {
    reveal();
    setPhase("gone");
    // Written from the client because that is where "the guest has
    // actually seen it" is known. The server reads it on the next visit
    // and leaves the envelope out of the page entirely.
    document.cookie = [
      `${sealCookieName(token)}=1`,
      `path=/i/${token}`,
      `max-age=${SEAL_COOKIE_MAX_AGE}`,
      "SameSite=Lax",
    ].join("; ");
    // Hand focus to the invitation rather than dropping it on <body>,
    // where a keyboard user would have to tab from the top of the page.
    // Quietly, if a pointer opened it: the ring is for the keyboard.
    const title = document.getElementById("invitation-title");
    if (title && byPointer.current) title.dataset.quietFocus = "";
    title?.focus();
  }, [token, reveal]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(revealTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (phase !== "sealed") return;
    // Focus goes to the stage, not the seal. Focusing the seal by script
    // before the guest has touched anything reads to the browser as
    // keyboard focus, and it drew a ring around the wax on every first
    // visit. From the stage, Escape still works and one Tab reaches the
    // seal, which is where a keyboard user would want to be.
    stageRef.current?.focus({ preventScroll: true });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  /**
   * On the stage, not on the seal - and that is a fix, not a flourish.
   *
   * The seal sits inside a subtree the camera is moving in Z, and while
   * the drift has it more than a pixel or so behind the camera's own
   * plane, Chrome's hit-testing hands the tap to the wrapper instead of
   * the wax: the seal was unclickable for the first several seconds and
   * then quietly began to work, which is about the most confusing thing
   * an opening gesture can do. Every tap lands somewhere inside the
   * stage whatever the compositor decides, so the stage listens. The
   * seal stays a button for the keyboard and the screen reader, and its
   * click bubbles here like any other.
   *
   * It also means the whole envelope is the target, which on a phone is
   * simply better: a guest taps the envelope they are holding.
   */
  function open(event: React.MouseEvent) {
    if (struck.current) return;
    struck.current = true;
    // A click the keyboard raised has no click count.
    byPointer.current = event.detail > 0;
    setPhase("breaking");
    // Reduced motion collapses every animation to nothing, so waiting out
    // the full sequence would leave a blank stage sitting there.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = setTimeout(dismiss, reduced ? 120 : OPEN_SEQUENCE_MS);
    if (!reduced) revealTimer.current = setTimeout(reveal, REVEAL_AT_MS);
  }

  if (phase === "gone") return null;

  return (
    <div
      ref={stageRef}
      tabIndex={-1}
      className="envelope-stage grain-stock outline-none"
      data-seal={phase === "breaking" ? "broken" : "sealed"}
      role="dialog"
      aria-modal="true"
      aria-label={`Invitation for ${addressee}`}
      onClick={open}
      onKeyDown={(event) => {
        // Escape is the way out of anything that covers the page.
        if (event.key === "Escape") dismiss();
      }}
    >
      {/* Two nested wrappers, not one: an animation replaces a transform
          rather than adding to it, so the ambient drift and the dolly the
          tap fires have to sit on separate elements or the second snaps
          away whatever the first had reached. */}
      <div className="envelope-camera">
        <div className="envelope-drift">
          {/* Held in the hand: it leans a few degrees towards the pointer
              while it is sealed, and settles flat as the wax goes. Inside
              the drift so the two compose, and pointer-only, so a phone
              never pays for it. */}
          <Tilt global max={4} enabled={phase === "sealed"} className="envelope-hand">
          <div className="envelope">
            <div className="envelope-back" />

            <div className="envelope-front grain-stock">
              {/* The lining, on the envelope rather than on the flap:
                  what a lined envelope shows you is the area the flap
                  was covering. Hidden under the flap until it lifts. */}
              <div className="envelope-throat" />

              {/* The same painted corner the invitation opens on, so the
                  envelope and what is in it are visibly one piece of
                  stationery. Small: this one is addressed, and the name
                  has to stay the loudest thing on it. */}
              {/* See the note in sections.tsx: /_next/image is not public,
                  so nothing under (public) may use next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={floral.src}
                alt=""
                aria-hidden
                className="pointer-events-none absolute bottom-0 left-0 w-[46%] select-none"
              />

              {/* Addressed the way it would be if it had come by post: in
                  the lower half, clear of the flap and the wax. */}
              <div className="absolute inset-x-0 top-[62%] bottom-0 flex flex-col items-center justify-center px-6 text-center sm:px-10">
                <p className="deboss font-display text-[clamp(1rem,4.2vw,1.4rem)] leading-tight text-ink">
                  {addressee}
                </p>
                {address && (
                  <p className="mt-1.5 text-[clamp(0.7rem,2.6vw,0.8125rem)] text-ink-faint">
                    {address}
                  </p>
                )}
              </div>
            </div>

            {/* Outer paper, the lining behind it, and a shading layer that
                darkens the pair as they turn away from the light. */}
            <div className="envelope-flap">
              <div className="envelope-flap-face grain-stock" />
              <div className="envelope-flap-lining grain-stock" />
              <div className="envelope-flap-shade" />
            </div>

            <button
              type="button"
              className="seal"
              disabled={phase !== "sealed"}
            >
              <span className="sr-only">
                Break the seal and open your invitation
              </span>
              <WaxSeal initialA={initialA} initialB={initialB} />
            </button>
          </div>
          </Tilt>
        </div>
      </div>

      {/* Pinned to the bottom of the stage rather than sitting in flow
          under the envelope, so it costs the envelope no height - which
          is what lets the framing be as close as it is. Goes the moment
          the seal is struck: there is nothing left to instruct. */}
      <p
        className={`pointer-events-none absolute inset-x-0 bottom-8 text-center transition-opacity duration-200 sm:bottom-12 ${
          phase === "sealed" ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden
      >
        <span className="eyebrow text-ink-faint">Break the seal</span>
      </p>

      <button
        type="button"
        onClick={(event) => {
          // The stage would read this as the tap that opens it.
          event.stopPropagation();
          byPointer.current = event.detail > 0;
          dismiss();
        }}
        className="absolute top-3 right-3 cursor-default rounded-md px-3 py-2 text-xs text-ink-faint/70 transition-colors hover:text-ink pointer-coarse:min-h-11"
      >
        Skip
      </button>
    </div>
  );
}
