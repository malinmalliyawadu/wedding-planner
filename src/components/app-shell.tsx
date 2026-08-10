"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

/**
 * The frame around every page. The spine is a column on a wide screen and a
 * drawer on a narrow one - the same markup either way, so navigation is
 * never rendered twice or hidden from a screen reader by accident.
 */
export function AppShell({
  spine,
  brand,
  children,
}: {
  /** The sidebar's contents, rendered on the server. */
  spine: ReactNode;
  /** A compact mark for the phone header. */
  brand: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  // Opening the drawer takes the focus with it, and closing gives it back -
  // but the page loading is not a close, and must not grab focus at all.
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (open) drawerRef.current?.focus();
    else menuRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only rounded-md bg-spine px-4 py-2 text-sm text-spine-ink focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-spine-hairline bg-spine px-3 py-2 text-spine-ink lg:hidden">
        <button
          ref={menuRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the menu"
          aria-expanded={open}
          aria-controls="app-spine"
          className="rounded-md p-2.5 text-spine-ink-soft transition-colors duration-150 hover:bg-spine-raised hover:text-spine-ink"
        >
          <Menu size={18} strokeWidth={1.75} aria-hidden />
        </button>
        {brand}
      </header>

      {/* The scrim: tapping the page behind the drawer closes it. */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={`fixed inset-0 z-30 bg-spine/55 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        ref={drawerRef}
        id="app-spine"
        tabIndex={-1}
        onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        // A link takes you somewhere, so the drawer has done its job.
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 max-w-[85vw] flex-col bg-spine text-spine-ink transition-[transform,visibility] duration-200 ease-out focus:outline-none lg:sticky lg:top-0 lg:h-dvh lg:max-w-none lg:shrink-0 lg:visible lg:translate-x-0 ${
          open ? "visible translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close the menu"
          className="absolute top-2 right-2 rounded-md p-2.5 text-spine-ink-soft transition-colors duration-150 hover:bg-spine-raised hover:text-spine-ink lg:hidden"
        >
          <X size={18} strokeWidth={1.75} aria-hidden />
        </button>
        {spine}
      </aside>

      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
