import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The check behind the app's side doors for machines: the photo booth
 * (`BOOTH_SYNC_TOKEN`) and the DJ bridge (`DJ_BRIDGE_TOKEN`). Neither is a
 * person with a browser, so neither can sign in; each carries a long
 * random token as a bearer instead.
 *
 * Compared without leaking the token's length or contents through
 * timing. Both sides are hashed to a fixed 32 bytes first, as
 * `password.ts` does, because `timingSafeEqual` throws on buffers of
 * different lengths. An unset or empty expected token opens nothing.
 *
 * No throttle, unlike the login form: the token is long and random
 * (`openssl rand -base64 24`), not something a person chose, and both
 * machines retry on a bad connection.
 */
export function verifyBearerToken(
  authorization: string | null,
  expected: string | undefined,
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
