import { NextResponse, type NextRequest } from "next/server";

/**
 * A second lock on the public carve-out.
 *
 * Traefik puts basicauth on the whole domain except `/i`, which the
 * guests need. That exemption is a path rule on a reverse proxy, and
 * path rules are exactly the thing that can be got wrong: a request for
 * `/i/../guests` matches `PathPrefix(/i)` on the way in, and Next
 * resolves it to `/guests` on the way out. Traefik may well normalise
 * that first - but "may well" is not the standard to hold a guest list
 * to, and this is cheap.
 *
 * So the public router stamps every request it lets through without a
 * password, and this refuses any such request that did not land on a
 * genuinely public route. The two have to agree; if they disagree, the
 * answer is no.
 *
 * Note the direction. The header can only ever *remove* access, never
 * grant it, so a stranger sending it themselves achieves nothing except
 * locking themselves out of pages they could not read anyway.
 */

/** Set by the unauthenticated Traefik router. See DEPLOYMENT.md step 6a. */
const PUBLIC_ROUTER_HEADER = "x-wedding-public";

/**
 * Everything a guest may reach. `/i` is the invitation; the static
 * chunks are the page's own JavaScript and fonts, which carry no data.
 *
 * `/_next/image` is deliberately absent, and must stay absent: the
 * optimiser fetches whatever same-origin path it is given, so exposing
 * it would hand out every private route that returns an image. That is
 * why the album ships its own thumbnails.
 */
export function isPublicPath(pathname: string): boolean {
  /*
   * A dot segment disqualifies the path outright, before anything else
   * is considered. In practice Next has already normalised what this
   * sees - but a predicate that decides who may read the guest list
   * should not be relying on somebody upstream having tidied its input.
   * Nothing public here has any use for `..`.
   */
  if (pathname.split("/").some((segment) => segment === ".." || segment === ".")) {
    return false;
  }

  return (
    // The landing page, and only the landing page. Note this is an
    // exact match: `/` as a *prefix* would be the entire site.
    pathname === "/" ||
    pathname === "/i" ||
    pathname.startsWith("/i/") ||
    pathname.startsWith("/_next/static/") ||
    pathname === "/favicon.ico"
  );
}

export function proxy(request: NextRequest) {
  const viaPublicRouter =
    request.headers.get(PUBLIC_ROUTER_HEADER) !== null;

  if (viaPublicRouter && !isPublicPath(request.nextUrl.pathname)) {
    // Deliberately indistinguishable from a route that does not exist.
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Everything. The check is a header read and a string compare, and the
   * paths worth protecting are precisely the ones a narrower matcher
   * would be tempted to skip.
   */
  matcher: "/:path*",
};
