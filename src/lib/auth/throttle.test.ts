import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  WINDOW_MS,
  clearAttempts,
  recordAttempt,
  type ThrottleStore,
} from "./throttle";

const START = 1_700_000_000_000;

function fresh(): ThrottleStore {
  return new Map();
}

describe("recordAttempt", () => {
  it("allows attempts up to the limit and then stops", () => {
    const store = fresh();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect(recordAttempt(store, "login", START + i).allowed).toBe(true);
    }
    expect(recordAttempt(store, "login", START + MAX_ATTEMPTS).allowed).toBe(
      false,
    );
  });

  it("counts down what is left", () => {
    const store = fresh();
    const first = recordAttempt(store, "login", START);
    expect(first).toEqual({ allowed: true, remaining: MAX_ATTEMPTS - 1 });
  });

  it("lets the window roll off", () => {
    const store = fresh();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      recordAttempt(store, "login", START);
    }
    expect(recordAttempt(store, "login", START + WINDOW_MS - 1).allowed).toBe(
      false,
    );
    // One millisecond past the window and the oldest attempt no longer counts.
    expect(recordAttempt(store, "login", START + WINDOW_MS + 1).allowed).toBe(
      true,
    );
  });

  it("does not let hammering push the retry time further out", () => {
    // A script that keeps trying must not extend the lockout, or it could
    // keep the couple out of their own planner for as long as it ran.
    const store = fresh();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordAttempt(store, "login", START);

    const first = recordAttempt(store, "login", START + 1000);
    const later = recordAttempt(store, "login", START + 2000);
    if (first.allowed || later.allowed) throw new Error("expected both refused");
    expect(later.retryAfterSeconds).toBeLessThan(first.retryAfterSeconds + 1);
  });

  it("reports a retry time inside the window", () => {
    const store = fresh();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordAttempt(store, "login", START);
    const verdict = recordAttempt(store, "login", START);
    if (verdict.allowed) throw new Error("expected refusal");
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
    expect(verdict.retryAfterSeconds).toBeLessThanOrEqual(WINDOW_MS / 1000);
  });

  it("keeps separate keys separate", () => {
    const store = fresh();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordAttempt(store, "login", START);
    expect(recordAttempt(store, "login", START).allowed).toBe(false);
    expect(recordAttempt(store, "feed", START).allowed).toBe(true);
  });
});

describe("clearAttempts", () => {
  it("forgets the near misses that came before a correct password", () => {
    const store = fresh();
    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) {
      recordAttempt(store, "login", START);
    }
    clearAttempts(store, "login");
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect(recordAttempt(store, "login", START).allowed).toBe(true);
    }
  });
});
