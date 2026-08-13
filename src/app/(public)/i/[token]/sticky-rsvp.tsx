"use client";

import { useEffect, useState } from "react";

/**
 * A reply button that follows the guest down the page on a phone.
 *
 * It appears once the invitation's opening card has scrolled away and
 * hides again while the reply card is actually on screen, so it never
 * covers the thing it is pointing at. Desktop has room for the button in
 * the hero and does not need it, so it stays out of the way there.
 */
export function StickyRsvp() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const rsvp = document.getElementById("rsvp");
    const hero = document.getElementById("invitation-title");
    if (!rsvp || !hero) return;

    let heroGone = false;
    let rsvpShowing = false;
    const sync = () => setVisible(heroGone && !rsvpShowing);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === hero) heroGone = !entry.isIntersecting;
          if (entry.target === rsvp) rsvpShowing = entry.isIntersecting;
        }
        sync();
      },
      // A sliver counts as "showing": by the time the reply card's top
      // edge is up, the guest has found it and the bar is just clutter.
      { rootMargin: "-20% 0px -20% 0px" },
    );
    observer.observe(hero);
    observer.observe(rsvp);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-opacity duration-200 lg:hidden ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <a
        href="#rsvp"
        tabIndex={visible ? undefined : -1}
        aria-hidden={!visible}
        className="inline-flex min-h-12 w-full max-w-sm items-center justify-center rounded-full bg-ink px-6 text-sm font-medium text-paper shadow-overlay"
      >
        Reply to your invitation
      </a>
    </div>
  );
}
