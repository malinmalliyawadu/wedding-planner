import { describe, expect, it } from "vitest";
import { isPublicPath } from "./proxy";

/**
 * This function decides what an unauthenticated stranger may read. It is
 * the smallest piece of code in the repo with the largest consequence
 * for getting it wrong, so it is pinned from both directions: the things
 * that must be reachable, and the things that must not.
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
    "/_next/static/chunks/main.js",
    "/_next/static/media/marcellus.woff2",
    "/favicon.ico",
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

  it("does not open the image optimiser", () => {
    // It fetches any same-origin path it is handed, which would make it
    // a way past basicauth into every private route serving an image.
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
