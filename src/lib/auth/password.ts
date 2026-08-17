import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The app password: the way in before a passkey exists.
 *
 * A passkey cannot be the only credential, because registering one
 * requires already being signed in. So `APP_PASSWORD` is the bootstrap -
 * you type it once on a new deployment, add a passkey, and after that it
 * is the fallback for a device you have not enrolled yet and the way back
 * in if you lose the phone that held the only passkey.
 *
 * It is deliberately *not* stored in the database and not hashed with a
 * work factor. It is an environment variable the two of you chose, set
 * once, on a service with two users - the same shape of secret as the
 * basicauth password it replaces. What guards it against being guessed is
 * the throttle in `throttle.ts`, not a KDF.
 */

/** Whether a way in exists at all. Nothing can sign in without this set. */
export function isPasswordConfigured(): boolean {
  return (process.env.APP_PASSWORD ?? "") !== "";
}

/**
 * Compare a submitted password against `APP_PASSWORD` without leaking its
 * length or its contents through how long the comparison took.
 *
 * `timingSafeEqual` throws on buffers of different lengths, which would
 * hand the length back to the caller as an exception - so both sides are
 * hashed to a fixed 32 bytes first and the digests are compared instead.
 */
export function verifyAppPassword(submitted: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  // An unset password is not an empty password: with no APP_PASSWORD there
  // is no password login at all, rather than one that "" satisfies.
  if (expected === "") return false;
  return timingSafeEqual(sha256(submitted), sha256(expected));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Pull the password out of an `Authorization: Basic` header.
 *
 * Only the calendar feed uses this - see `allowsAppPasswordAuth` in
 * `src/proxy.ts`. The username is ignored: there is one credential here,
 * so a calendar client can put anything before the colon.
 */
export function appPasswordFromBasicAuth(header: string | null): string | null {
  if (header === null) return null;
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }

  const colon = decoded.indexOf(":");
  // No colon at all is a malformed header, not a blank password.
  if (colon === -1) return null;
  return decoded.slice(colon + 1);
}
