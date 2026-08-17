/**
 * A fixed-window limit on password guesses.
 *
 * `APP_PASSWORD` is a password a human chose and typed, so the only thing
 * standing between it and a dictionary is how many attempts an attacker
 * gets. Until this milestone that job belonged to whatever Traefik felt
 * like doing about it; now the app owns the login form, so the app owns
 * the counting.
 *
 * The store is a module-level Map, which means it is per-process and lost
 * on restart. Both of those are fine and neither is hidden: this runs as
 * one container, and a restart that clears the counters is a restart the
 * attacker did not cause. Note the proxy is bundled separately from the
 * server, so the calendar feed's Basic-auth checks are counted in their
 * own instance of this - two windows rather than one, which is still two
 * orders of magnitude short of guessing anything.
 *
 * Passkeys are not throttled and do not need to be. A WebAuthn assertion
 * cannot be brute-forced; a wrong one is a signature that does not verify.
 */

export type ThrottleStore = Map<string, number[]>;

/** Guesses allowed per key per window. Generous for a typo, mean for a script. */
export const MAX_ATTEMPTS = 8;

/** How long the window is. */
export const WINDOW_MS = 15 * 60 * 1000;

export type ThrottleVerdict =
  | { allowed: true; remaining: number }
  /** Seconds until the oldest attempt in the window falls out of it. */
  | { allowed: false; retryAfterSeconds: number };

/**
 * Record an attempt and say whether it may proceed.
 *
 * Pure in the sense that matters: the store is passed in, so a test can
 * hold its own and time is a parameter rather than a clock read.
 */
export function recordAttempt(
  store: ThrottleStore,
  key: string,
  now: number,
): ThrottleVerdict {
  const cutoff = now - WINDOW_MS;
  const recent = (store.get(key) ?? []).filter((at) => at > cutoff);

  if (recent.length >= MAX_ATTEMPTS) {
    // Keep the window as it stands. Hammering must not push the retry
    // time further out, or a slow script would lock the couple out for
    // as long as it kept running.
    store.set(key, recent);
    const oldest = recent[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((oldest + WINDOW_MS - now) / 1000),
      ),
    };
  }

  recent.push(now);
  store.set(key, recent);
  return { allowed: true, remaining: MAX_ATTEMPTS - recent.length };
}

/** Called on a correct password, so a near-miss does not count against you. */
export function clearAttempts(store: ThrottleStore, key: string): void {
  store.delete(key);
}

const defaultStore: ThrottleStore = new Map();

/** The process-wide store. Tests pass their own to `recordAttempt`. */
export function attemptPasswordLogin(key: string): ThrottleVerdict {
  return recordAttempt(defaultStore, key, Date.now());
}

export function forgetFailedLogins(key: string): void {
  clearAttempts(defaultStore, key);
}
