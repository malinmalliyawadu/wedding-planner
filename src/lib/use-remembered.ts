"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A single string remembered in localStorage.
 *
 * `useSyncExternalStore` rather than useState-plus-an-effect, because
 * localStorage genuinely *is* an external store and this is what the
 * hook is for. It also gets the server render right for free: the server
 * snapshot is the empty string, so the markup matches and there is no
 * hydration mismatch to paper over, and no flash of an empty field being
 * filled in a frame later.
 *
 * Writes are broadcast to every subscriber in this tab, and `storage`
 * events cover the same page open in another one.
 */

const listeners = new Set<() => void>();

/**
 * Where the value lives when localStorage will not have it - private
 * browsing refuses the write. Without this the field would silently
 * refuse to accept typing, which is far worse than forgetting.
 */
const inMemory = new Map<string, string>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useRemembered(
  key: string,
): [string, (value: string) => void] {
  const getSnapshot = useCallback(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return stored;
    } catch {
      // Some browsers refuse even reads in private mode.
    }
    return inMemory.get(key) ?? "";
  }, [key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => "");

  const set = useCallback(
    (next: string) => {
      inMemory.set(key, next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Kept for this visit only, which is the graceful failure.
      }
      // A same-tab write fires no storage event, so tell subscribers.
      for (const listener of listeners) listener();
    },
    [key],
  );

  return [value, set];
}
