import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The photo booth's side door.
 *
 * The booth at the venue (a separate project, `photo-booth`) sends each
 * finished session's photograph here, so that its prints sit in the
 * same album as the photographs guests upload from their phones. It is
 * a worker process with no browser, so it cannot sign in: it carries
 * `BOOTH_SYNC_TOKEN` as a bearer instead, and this module is what
 * checks it and what shapes the booth's identifiers.
 *
 * Pure on purpose, like `invite-token.ts`: the route handler does the
 * reading and writing, and the decisions in here get unit tests.
 */

/** What the album shows under a booth photograph in place of a name. */
export const BOOTH_UPLOADER_NAME = "The photo booth";

/**
 * A booth session ID, which is also the end of the QR link. The booth
 * makes them like our invite tokens (20 characters from the same
 * alphabet), but the shape is held loosely on purpose - a different
 * booth with a different ID scheme should not need a change here - and
 * strictly enough that one is always safe in a path and a key.
 */
const SESSION_ID = /^[a-z0-9]{8,64}$/;

export function isBoothSessionId(value: string): boolean {
  return SESSION_ID.test(value);
}

/** Whether a booth can send anything at all. Unset means the door is shut. */
export function isBoothConfigured(): boolean {
  return (process.env.BOOTH_SYNC_TOKEN ?? "") !== "";
}

/**
 * Check an `Authorization: Bearer` header against the configured token
 * without leaking the token's length or contents through timing. Both
 * sides are hashed to a fixed 32 bytes first, as `password.ts` does,
 * because `timingSafeEqual` throws on buffers of different lengths.
 *
 * There is no throttle here, unlike the login form: the token is long
 * and random (`openssl rand -base64 24`), not something a person chose,
 * and the booth retries an upload a dozen times on a bad connection.
 */
export function verifyBoothToken(
  authorization: string | null,
  expected: string | undefined = process.env.BOOTH_SYNC_TOKEN,
): boolean {
  if (!expected) return false;
  if (authorization === null) return false;
  const [scheme, ...rest] = authorization.trim().split(/\s+/);
  const presented = rest.join(" ");
  if (scheme?.toLowerCase() !== "bearer" || presented === "") return false;
  return timingSafeEqual(sha256(presented), sha256(expected));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Whether these bytes start the way a JPEG does. The booth is trusted
 * to send JPEGs, but the bucket is served straight to guests' browsers
 * as `image/jpeg`, and a check that costs three bytes is cheaper than
 * finding out on the night that a stray file does not render.
 */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * When the booth says the session happened, so the album files the
 * print where it was taken rather than where a late upload landed.
 * Anything unparseable, or absurdly far from now, is ignored in favour
 * of the clock: a booth whose clock is wrong should not be able to put
 * a photograph at the top of the album forever.
 */
export function parseTakenAt(
  value: string | null,
  now: Date = new Date(),
): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const driftMs = Math.abs(parsed.getTime() - now.getTime());
  const week = 7 * 24 * 60 * 60 * 1000;
  return driftMs <= week ? parsed : null;
}

/** The page the booth's QR code carries, relative to the site. */
export function boothPhotoPath(sessionId: string): string {
  return `/i/booth/${sessionId}`;
}
