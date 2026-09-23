import { headers } from "next/headers";

/**
 * Which origin this request arrived at.
 *
 * Derived from the request rather than configured, so the same image
 * works on localhost and on the real domain with no extra variable to
 * get wrong. Behind Traefik the forwarded headers are what carry the
 * truth; `host` alone would be the container.
 *
 * `APP_ORIGIN` exists for the setups where the forwarded headers are
 * wrong. Two things read this: the passkey relying party, where a wrong
 * answer refuses a legitimate sign-in (see `relyingParty`), and the
 * absolute URL in a link preview, where a wrong answer points every
 * messaging app at an image it cannot fetch.
 */
export async function requestOrigin(): Promise<string> {
  const configured = process.env.APP_ORIGIN;
  if (configured) return new URL(configured).origin;

  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host") ?? "localhost:3000";
  const proto =
    store.get("x-forwarded-proto")?.split(",")[0].trim() ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}
