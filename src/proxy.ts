import { NextResponse, type NextRequest } from "next/server";
import {
  appPasswordFromBasicAuth,
  verifyAppPassword,
} from "@/lib/auth/password";
import { SESSION_COOKIE, findSession } from "@/lib/auth/session";
import { attemptPasswordLogin, forgetFailedLogins } from "@/lib/auth/throttle";

/**
 * The gate. Two locks on one door, and they have to agree.
 *
 * **The first lock** is the public carve-out. Traefik may serve `/` and
 * `/i` without a password, and that exemption is a path rule on a reverse
 * proxy - exactly the thing that can be got wrong. A request for
 * `/i/../admin/guests` matches `PathPrefix(/i)` on the way in and Next
 * resolves it to `/admin/guests` on the way out. So the public router
 * stamps every request it lets through without a password, and this
 * refuses any stamped request that did not land on a genuinely public
 * route. Note the direction: the header can only ever *remove* access,
 * never grant it, so a stranger sending it themselves achieves nothing
 * except locking themselves out of pages they could not read anyway.
 *
 * **The second lock** is the planner's own sign-in, and it is here rather
 * than in a layout for the same reason the public surface is one folder:
 * so that coverage is structural instead of remembered. A new admin page
 * or route handler is behind the session because it exists, not because
 * someone added it to a list. The three route handlers under `/admin` (a
 * photograph, the calendar feed, a run sheet PDF) render no layout and
 * would each have needed their own guard otherwise.
 *
 * **Server actions are the deliberate exception**, and they are guarded
 * one by one instead - see `actions-guarded.test.ts`. An action is not a
 * route: it is dispatched by the id in its `Next-Action` header, and the
 * path it was POSTed to is only where the response gets rendered. Turning
 * one away *here* is both incomplete and actively harmful. Incomplete,
 * because the path is not what selected the action. Harmful, because an
 * HTTP redirect is not something the router can follow for an action POST
 * - the browser re-POSTs, gets HTML back, and the click dies on a page
 * that stays put with "an unexpected response was received". The guard
 * inside the action throws `redirect()` instead, which the router does
 * understand, so a session that expired mid-visit takes you to the
 * sign-in page like it should.
 *
 * `isPublicPath` is what both locks are written in terms of, which is what
 * keeps them from drifting apart: one list of what a stranger may read.
 */

/** Set by the unauthenticated Traefik router. See DEPLOYMENT.md step 6a. */
const PUBLIC_ROUTER_HEADER = "x-wedding-public";

/**
 * Everything a guest may reach. `/i` is the invitation; the static chunks,
 * the icons and the favicon are build output and carry no data.
 *
 * `/login` is here because the app's own sign-in has to be reachable by
 * someone who is, by definition, not signed in yet - and because it must
 * still work if the basicauth in front of the app is ever taken off.
 *
 * `/_next/image` is deliberately absent, and must stay absent: the
 * optimiser fetches whatever same-origin path it is given, so exposing it
 * would hand out every private route that returns an image. That is why
 * the album ships its own thumbnails.
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
    pathname === "/login" ||
    pathname.startsWith("/_next/static/") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/apple-icon.png"
  );
}

/**
 * Whether this path needs somebody signed in.
 *
 * Private by default, which is the whole point: the question is not "is
 * this one of the pages we protect" but "is this one of the few we do not".
 * Anything new is covered until it is explicitly excused here.
 *
 * `/api/health` is the one exception that is not public: Coolify probes it
 * from inside Docker, where there is no cookie to present, and a health
 * check that reports "not signed in" tells the orchestrator nothing about
 * whether the app can reach Postgres. It answers `ok` or a database error
 * and reads nothing else.
 */
export function needsSession(pathname: string): boolean {
  if (isPublicPath(pathname)) return false;
  if (pathname === "/api/health") return false;
  return true;
}

/**
 * Whether this request is a server action being dispatched, and therefore
 * something to leave to the action's own `requireAdmin()`.
 *
 * **The method matters, and it is the whole of the safety here.** A server
 * action is always a POST; a GET carrying the same header is not an action
 * at all, it is an ordinary page request wearing a hat. Letting one of
 * those through renders the page before the layout's guard can redirect,
 * and Next then sends a `307` to `/login` *with the rendered guest list
 * still in the body* - a status code that looks perfectly safe over a
 * response that is not. Anything reading bodies rather than statuses gets
 * the lot.
 *
 * So: POST only, and `proxy.test.ts` pins it from both directions.
 */
export function dispatchesServerAction(
  method: string,
  actionHeader: string | null,
): boolean {
  return method === "POST" && actionHeader !== null;
}

/**
 * Paths a machine may reach with the app password in an `Authorization`
 * header instead of a session cookie.
 *
 * Just the calendar feed. A calendar client cannot use a passkey, cannot
 * fill in a form and cannot hold a cookie - it fetches a URL every few
 * hours forever - so the subscription only survives the app taking over
 * authentication if the app also accepts a credential a calendar can
 * carry. This is the same password, over the same TLS, on one path.
 */
export function allowsAppPasswordAuth(pathname: string): boolean {
  return pathname === "/admin/timeline/tasks.ics";
}

/** True when the app password opened this request. */
async function basicAuthAccepted(request: NextRequest): Promise<boolean> {
  const submitted = appPasswordFromBasicAuth(
    request.headers.get("authorization"),
  );
  if (submitted === null) return false;

  // Throttled like the login form, and for the same reason: this is a
  // password, so the only real defence is how many goes an attacker gets.
  const verdict = attemptPasswordLogin("proxy-basic");
  if (!verdict.allowed) return false;

  if (!verifyAppPassword(submitted)) return false;
  forgetFailedLogins("proxy-basic");
  return true;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const viaPublicRouter = request.headers.get(PUBLIC_ROUTER_HEADER) !== null;
  if (viaPublicRouter && !isPublicPath(pathname)) {
    // Deliberately indistinguishable from a route that does not exist.
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (!needsSession(pathname)) return NextResponse.next();

  /*
   * A server action guards itself. See the note at the top of this file:
   * the path did not choose the action, and a 307 from here would break
   * the click rather than redirect it. Every planner action opens with
   * `await requireAdmin()`, and `actions-guarded.test.ts` is what keeps
   * that true.
   */
  if (
    dispatchesServerAction(request.method, request.headers.get("next-action"))
  ) {
    return NextResponse.next();
  }

  const session = await findSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session !== null) return NextResponse.next();

  if (allowsAppPasswordAuth(pathname)) {
    if (await basicAuthAccepted(request)) return NextResponse.next();
    // A calendar client needs to be *asked*, or it has no way to know it
    // should send credentials. A browser that wandered here gets the same
    // prompt, which is honest about what the URL wants.
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="The Wedding Ledger", charset="UTF-8"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  return NextResponse.redirect(signInUrl(request));
}

/**
 * Where to send someone who is not signed in.
 *
 * The path they wanted is carried in `next` so they land where they were
 * going. Only the path and query, never a full URL: a `next` that could
 * name another host would make this an open redirect, and `/login` reads
 * it back through the same rule (see `safeNextPath`).
 */
function signInUrl(request: NextRequest): URL {
  const url = new URL("/login", request.nextUrl);
  const wanted = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (wanted !== "/admin") url.searchParams.set("next", wanted);
  return url;
}

export const config = {
  /*
   * Everything. The check is a header read, a string compare and - for the
   * paths that need one - a single indexed row lookup, and the paths worth
   * protecting are precisely the ones a narrower matcher would be tempted
   * to skip.
   */
  matcher: "/:path*",
};
