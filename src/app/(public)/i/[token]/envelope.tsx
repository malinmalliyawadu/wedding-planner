"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const OPEN_SEQUENCE_MS = 1600;

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
  const sealRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismiss = useCallback(() => {
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
    document.getElementById("invitation-title")?.focus();
  }, [token]);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (phase !== "sealed") return;
    sealRef.current?.focus({ preventScroll: true });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  function open() {
    if (phase !== "sealed") return;
    setPhase("breaking");
    // Reduced motion collapses every animation to nothing, so waiting out
    // the full sequence would leave a blank stage sitting there.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = setTimeout(dismiss, reduced ? 120 : OPEN_SEQUENCE_MS);
  }

  if (phase === "gone") return null;

  return (
    <div
      ref={stageRef}
      className="envelope-stage grain"
      data-seal={phase === "breaking" ? "broken" : "sealed"}
      role="dialog"
      aria-modal="true"
      aria-label={`Invitation for ${addressee}`}
      onKeyDown={(event) => {
        // Escape is the way out of anything that covers the page.
        if (event.key === "Escape") dismiss();
      }}
    >
      <div className="envelope">
        <div className="envelope-back" />

        {/* What rises out. Kept plain: the real card is underneath the
            whole stage, and this is only the gesture of it arriving. */}
        <div className="envelope-card grain grid place-items-center px-6">
          <p className="engraved deboss text-center text-[clamp(1rem,4vw,1.5rem)] text-ink">
            {initialA}
            <span className="ampersand mx-1.5 text-[1.3em]">&amp;</span>
            {initialB}
          </p>
        </div>

        <div className="envelope-front grain">
          {/* Addressed the way it would be if it had come by post: in the
              lower half, clear of the flap and the wax. */}
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

        <div className="envelope-flap grain" />

        <button
          ref={sealRef}
          type="button"
          className="seal"
          onClick={open}
          disabled={phase !== "sealed"}
        >
          <span className="sr-only">Break the seal and open your invitation</span>
          <WaxSeal initialA={initialA} initialB={initialB} />
        </button>
      </div>

      {/* Sits under the envelope, where the thing it names actually is -
          and goes the moment the seal is struck, because there is nothing
          left to instruct. */}
      <p
        className={`mt-8 text-center transition-opacity duration-200 ${
          phase === "sealed" ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden
      >
        <span className="eyebrow text-ink-faint">Break the seal</span>
      </p>

      <button
        type="button"
        onClick={dismiss}
        className="absolute top-3 right-3 rounded-md px-3 py-2 text-xs text-ink-faint/70 transition-colors hover:text-ink pointer-coarse:min-h-11"
      >
        Skip
      </button>
    </div>
  );
}
