import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allowsAppPasswordAuth,
  dispatchesServerAction,
  isPublicPath,
  needsSession,
} from "./proxy";

/**
 * These two predicates decide what an unauthenticated stranger may read
 * and what the planner's own sign-in stands in front of. They are the
 * smallest pieces of code in the repo with the largest consequence for
 * getting wrong, so both are pinned from both directions: the things that
 * must be reachable, and the things that must not.
 */

describe("isPublicPath", () => {
  it.each([
    "/",
    "/i",
    "/i/abcdefghjkmnpqrstuvw",
    "/i/abcdefghjkmnpqrstuvw/photos",
    "/i/abcdefghjkmnpqrstuvw/wedding.ics",
    "/i/photo/12",
    "/i/photo/12/thumb",
    "/login",
    "/_next/static/chunks/main.js",
    "/_next/static/media/marcellus.woff2",
    "/favicon.ico",
    "/icon.svg",
    "/apple-icon.png",
  ])("lets guests reach %s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each([
    "/admin",
    "/admin/guests",
    "/admin/households",
    "/admin/budget",
    "/admin/savings",
    "/admin/seating",
    "/admin/settings",
    "/admin/access",
    "/admin/invitations",
    "/admin/invitations/content",
    "/admin/photos",
    "/admin/photos/1/image",
    "/admin/timeline/tasks.ics",
    "/admin/run-sheet",
    "/wall",
    "/api/health",
  ])("keeps strangers out of %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });

  it("opens the landing page without opening the site under it", () => {
    // The single most dangerous thing that could go wrong here: `/` as a
    // prefix rather than an exact match would make every page public.
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/admin")).toBe(false);
    expect(isPublicPath("/wall")).toBe(false);
    expect(isPublicPath("/anything-at-all")).toBe(false);
  });

  it("opens the sign-in page and nothing beside it", () => {
    // /login has to be reachable by someone who is not signed in, but it
    // is an exact match: no tree hangs off it.
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/login/reset")).toBe(false);
    expect(isPublicPath("/logins")).toBe(false);
  });

  it("does not open the image optimiser", () => {
    // It fetches any same-origin path it is handed, which would make it
    // a way past the sign-in into every private route serving an image.
    // The album ships its own thumbnails so this can stay shut.
    expect(isPublicPath("/_next/image")).toBe(false);
  });

  it("is not fooled by a path that merely starts with the letter i", () => {
    expect(isPublicPath("/invitations")).toBe(false);
    expect(isPublicPath("/images/secret.png")).toBe(false);
    expect(isPublicPath("/index")).toBe(false);
  });

  it("does not treat /_next as public beyond the static chunks", () => {
    expect(isPublicPath("/_next")).toBe(false);
    expect(isPublicPath("/_next/")).toBe(false);
    expect(isPublicPath("/_next/data/build/guests.json")).toBe(false);
  });

  it("rejects a traversal that survived to this point", () => {
    // The proxy sees a normalised pathname, so this is belt and braces
    // for the case where something upstream hands one through raw.
    expect(isPublicPath("/i/../guests")).toBe(false);
    expect(isPublicPath("/_next/static/../../guests")).toBe(false);
  });
});

describe("needsSession", () => {
  it.each([
    "/admin",
    "/admin/guests",
    "/admin/households",
    "/admin/budget",
    "/admin/budget/scenarios",
    "/admin/savings",
    "/admin/seating",
    "/admin/settings",
    "/admin/access",
    "/admin/invitations",
    "/admin/invitations/content",
    "/admin/photos",
    "/admin/photos/1/image",
    "/admin/timeline",
    "/admin/timeline/tasks.ics",
    "/admin/run-sheet",
    "/admin/run-sheet/everyone/sheet.pdf",
    "/admin/venues",
    "/admin/venues/rank",
    "/wall",
    "/_next/image",
  ])("stands in front of %s", (path) => {
    expect(needsSession(path)).toBe(true);
  });

  it.each(["/", "/i", "/i/abcdefghjkmnpqrstuvw", "/login", "/favicon.ico"])(
    "lets %s through without a session",
    (path) => {
      expect(needsSession(path)).toBe(false);
    },
  );

  it("lets the health check through", () => {
    // Coolify probes this from inside Docker, where there is no cookie to
    // present, and a probe that answered "not signed in" would report
    // nothing about whether the app can reach Postgres.
    expect(needsSession("/api/health")).toBe(false);
  });

  it("guards anything it has never heard of", () => {
    // Private by default is the whole design: a page added tomorrow is
    // behind the sign-in because it exists, not because someone
    // remembered to list it.
    expect(needsSession("/whatever-comes-next")).toBe(true);
    expect(needsSession("/api/something-new")).toBe(true);
    expect(needsSession("/api/health/details")).toBe(true);
  });
});

describe("allowsAppPasswordAuth", () => {
  it("covers the calendar feed", () => {
    // A calendar client cannot use a passkey or fill in a form, so the
    // subscription only survives the app owning authentication if the
    // app accepts a credential a calendar can carry.
    expect(allowsAppPasswordAuth("/admin/timeline/tasks.ics")).toBe(true);
  });

  it.each([
    "/admin",
    "/admin/guests",
    "/admin/photos/1/image",
    "/admin/run-sheet/everyone/sheet.pdf",
    "/admin/timeline",
    "/wall",
  ])("does not extend to %s", (path) => {
    // Every extra path here is another URL a password can be guessed at.
    expect(allowsAppPasswordAuth(path)).toBe(false);
  });
});

describe("dispatchesServerAction", () => {
  it("recognises an action POST, which guards itself", () => {
    expect(dispatchesServerAction("POST", "0011aabb")).toBe(true);
  });

  it.each(["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS", "post"])(
    "refuses to treat a %s as an action, whatever header it carries",
    (method) => {
      /*
       * This is the sharp edge. A GET with a `Next-Action` header is an
       * ordinary page request, and letting it past the gate renders the
       * page before the layout's guard can redirect - Next then answers
       * `307 -> /login` with the whole guest list still in the body. The
       * status looks safe; the response is not. Only a POST is an action.
       */
      expect(dispatchesServerAction(method, "0011aabb")).toBe(false);
    },
  );

  it("is not an action without the header", () => {
    expect(dispatchesServerAction("POST", null)).toBe(false);
  });

  it("treats an empty header as present, because Next does", () => {
    // Not a judgement call worth making here: if the header is there at
    // all the request is going to the action dispatcher either way.
    expect(dispatchesServerAction("POST", "")).toBe(true);
  });
});

/**
 * The exhaustive half.
 *
 * The lists above say what we thought to check. This walks `src/app` and
 * insists that every route the app actually serves is either behind the
 * sign-in or one of the handful deliberately not - so a page added without
 * a thought for either lock fails the build rather than shipping open.
 *
 * It is the same trick as `no-private-imports.test.ts`: read the tree, not
 * a list someone has to remember to extend.
 */
describe("every route the app serves", () => {
  /** Routes that answer without a session, and why each one is allowed to. */
  const UNGATED = new Map([
    ["/", "the guests' landing page"],
    ["/i/:token", "the invitation - the link is the credential"],
    ["/i/:token/photos", "the shared album"],
    ["/i/:token/wedding.ics", "the calendar file for guests"],
    ["/i/photo/:id", "one guest photograph, hidden ones refused"],
    ["/i/photo/:id/thumb", "its thumbnail"],
    ["/login", "reachable by definition before signing in"],
    ["/api/health", "probed from inside Docker, reports the database"],
  ]);

  const routes = appRoutes(join(process.cwd(), "src/app"));

  it("finds routes to check at all", () => {
    // Guards against this passing because the tree moved and the walk
    // quietly started looking at nothing.
    expect(routes.length).toBeGreaterThan(20);
  });

  it("includes the routes that matter", () => {
    // And against a walk that silently stopped seeing whole subtrees.
    expect(routes).toContain("/admin/guests");
    expect(routes).toContain("/admin/timeline/tasks.ics");
    expect(routes).toContain("/i/:token");
    expect(routes).toContain("/wall");
    expect(routes).toContain("/login");
  });

  it("is either gated or listed as deliberately open", () => {
    const open = routes.filter((route) => !needsSession(route));
    expect(open.sort()).toEqual([...UNGATED.keys()].sort());
  });

  it.each([...UNGATED])("still serves %s (%s)", (route) => {
    // The other direction: an over-eager gate that shut the invitation or
    // the health check would break guests and deployment respectively.
    expect(needsSession(route)).toBe(false);
  });
});

/**
 * Every `page.tsx` and `route.ts` under `src/app`, as the pathname a
 * request for it would carry. Route groups like `(public)` are not path
 * segments; dynamic ones stand in as `:token` so the predicates see a
 * shape rather than a literal `[token]`.
 */
function appRoutes(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      // `tasks.ics` and `sheet.pdf` are directories holding a route.ts, so
      // a dot in the name is part of the path rather than an extension.
      const segment = entry.name.startsWith("(")
        ? "" // a route group: organisation, not URL
        : entry.name.startsWith("[")
          ? `/:${entry.name.replace(/[[\]./]|^\.\.\./g, "")}`
          : `/${entry.name}`;
      return appRoutes(path, prefix + segment);
    }

    if (/^(page|route)\.tsx?$/.test(entry.name)) return [prefix || "/"];
    return [];
  });
}
