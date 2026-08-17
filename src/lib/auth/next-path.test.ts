import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it.each([
    "/admin",
    "/admin/guests",
    "/admin/budget/scenarios?s=1&s=2",
    "/wall",
    "/admin/timeline/tasks.ics",
  ])("keeps the local path %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    ["nothing", null],
    ["an empty string", ""],
    ["an absolute URL", "https://evil.example/steal"],
    ["a scheme-relative URL", "//evil.example/steal"],
    ["a backslash host", "/\\evil.example"],
    ["a backslash anywhere", "/admin\\..\\wall"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a bare path with no slash", "admin/guests"],
    ["a dot segment", "/admin/../../etc/passwd"],
    ["a single dot segment", "/admin/./guests"],
    ["a newline", "/admin\nSet-Cookie: x=1"],
    ["a null byte", "/admin\x00"],
  ])("refuses %s and falls back to the planner", (_why, raw) => {
    expect(safeNextPath(raw)).toBe("/admin");
  });

  it("does not bounce back to the login page", () => {
    // Landing on /login again after signing in successfully looks exactly
    // like the sign-in having failed.
    expect(safeNextPath("/login")).toBe("/admin");
    expect(safeNextPath("/login?next=/admin")).toBe("/admin");
  });

  it("is not fooled by a path that merely starts with the word login", () => {
    expect(safeNextPath("/logins")).toBe("/logins");
  });
});
