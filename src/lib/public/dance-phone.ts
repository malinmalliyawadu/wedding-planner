import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

/**
 * The phone behind the venue's QR code.
 *
 * The invitation link names a household; the QR code on the tables names
 * nobody, because the same picture is in front of every guest. So a guest
 * who comes in that way is known by their phone instead: a random cookie,
 * minted the first time the page checks in, and the only thing that makes
 * "your request" and "you voted for this" mean anything there.
 *
 * It is an identity, not an account - nothing is asked for and nothing is
 * remembered past the night. Only its SHA-256 is written down, like the
 * planner's session tokens, so a backup of the queue is not a list of
 * live cookies. A plain hash is right for the same reason it is there:
 * 256 random bits have no dictionary to run against.
 *
 * Clearing cookies makes a new phone, which could be used to vote twice.
 * At a wedding that is a guest being cheeky, and the couple can still
 * overrule anything from the planner.
 */

const PHONE_COOKIE = "dance_phone";

/** Sent to the shared dance floor and nothing else. */
const PHONE_COOKIE_PATH = "/i/dance";

/** Long enough for the night and the morning after; there is no renewal. */
const PHONE_COOKIE_MAX_AGE_S = 3 * 24 * 60 * 60;

/** 32 bytes as base64url. Anything else is not one of ours and is ignored. */
const PHONE_COOKIE_SHAPE = /^[A-Za-z0-9_-]{43}$/;

function hashPhone(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

/**
 * This phone's key, or null when it has none yet. Safe anywhere,
 * including while rendering a page, because it only reads.
 */
export async function readPhoneKey(): Promise<string | null> {
  const value = (await cookies()).get(PHONE_COOKIE)?.value;
  return value && PHONE_COOKIE_SHAPE.test(value) ? hashPhone(value) : null;
}

/**
 * This phone's key, minting the cookie when there is none. Only from a
 * server action or a route handler: a page cannot set a cookie.
 */
export async function ensurePhoneKey(): Promise<string> {
  const existing = await readPhoneKey();
  if (existing) return existing;

  const value = randomBytes(32).toString("base64url");
  (await cookies()).set(PHONE_COOKIE, value, {
    httpOnly: true,
    // Not `secure` in development, or the browser will not keep it on
    // http://localhost - see the planner's session cookie.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: PHONE_COOKIE_PATH,
    maxAge: PHONE_COOKIE_MAX_AGE_S,
  });
  return hashPhone(value);
}
