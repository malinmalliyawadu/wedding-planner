/**
 * Where the login page is allowed to send you afterwards.
 *
 * The proxy puts the path you were heading for into `?next=`, and the
 * login page redirects there once you are in. That is a redirect target
 * taken from the URL bar, so it is only ever a path on this site: a `next`
 * that could name a scheme or a host would turn the sign-in page into an
 * open redirect, and a sign-in page is exactly where somebody is willing
 * to be sent somewhere and type a password.
 *
 * Everything that is not plainly a local path falls back to `/admin`.
 */

const FALLBACK = "/admin";

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return FALLBACK;

  // Must be a path on this host. A leading `//` is protocol-relative and
  // reads as a host to a browser, and a backslash is treated as a slash by
  // enough of them to matter.
  if (!raw.startsWith("/")) return FALLBACK;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return FALLBACK;

  // No scheme, no credentials, no newline smuggled into a header.
  if (/[\\]/.test(raw)) return FALLBACK;
  if (/[\x00-\x1f\x7f]/.test(raw)) return FALLBACK;

  // Never bounce back to the sign-in page - that reads as a failed login.
  if (raw === "/login" || raw.startsWith("/login?")) return FALLBACK;

  // A dot segment could resolve somewhere other than where it reads.
  const [path] = raw.split(/[?#]/);
  if (path.split("/").some((segment) => segment === ".." || segment === ".")) {
    return FALLBACK;
  }

  return raw;
}
