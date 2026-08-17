import { afterEach, describe, expect, it } from "vitest";
import {
  appPasswordFromBasicAuth,
  isPasswordConfigured,
  verifyAppPassword,
} from "./password";

/**
 * The app password is the only credential that exists on a fresh
 * deployment, so it is the one thing standing between the internet and the
 * guest list until a passkey is registered. Both directions are pinned.
 */

const original = process.env.APP_PASSWORD;

afterEach(() => {
  if (original === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = original;
});

describe("verifyAppPassword", () => {
  it("accepts the configured password", () => {
    process.env.APP_PASSWORD = "correct horse battery staple";
    expect(verifyAppPassword("correct horse battery staple")).toBe(true);
  });

  it.each([
    ["a different password", "wrong horse battery staple"],
    ["a prefix of it", "correct horse"],
    ["it with something appended", "correct horse battery staple!"],
    ["a blank submission", ""],
    ["a case change", "Correct horse battery staple"],
  ])("rejects %s", (_why, submitted) => {
    process.env.APP_PASSWORD = "correct horse battery staple";
    expect(verifyAppPassword(submitted)).toBe(false);
  });

  it("refuses everything when APP_PASSWORD is not set", () => {
    // The dangerous reading of an unset variable is "the password is
    // empty", which would open the planner to anyone submitting a blank
    // form. Unset means no password login at all.
    delete process.env.APP_PASSWORD;
    expect(verifyAppPassword("")).toBe(false);
    expect(verifyAppPassword("anything")).toBe(false);
    expect(isPasswordConfigured()).toBe(false);
  });

  it("treats an empty APP_PASSWORD as not set", () => {
    process.env.APP_PASSWORD = "";
    expect(verifyAppPassword("")).toBe(false);
    expect(isPasswordConfigured()).toBe(false);
  });

  it("does not throw on a submission of a different length", () => {
    // timingSafeEqual throws on mismatched lengths, which would leak the
    // length as an exception. Both sides are hashed first.
    process.env.APP_PASSWORD = "short";
    expect(() => verifyAppPassword("a".repeat(5000))).not.toThrow();
  });
});

describe("appPasswordFromBasicAuth", () => {
  const encode = (raw: string) =>
    `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;

  it("takes the password and ignores the username", () => {
    // One credential, so a calendar client may put anything before the
    // colon - which is what lets iOS ask for a username it then sends.
    expect(appPasswordFromBasicAuth(encode("ru:hunter2"))).toBe("hunter2");
    expect(appPasswordFromBasicAuth(encode("malin:hunter2"))).toBe("hunter2");
    expect(appPasswordFromBasicAuth(encode(":hunter2"))).toBe("hunter2");
  });

  it("keeps a colon inside the password", () => {
    expect(appPasswordFromBasicAuth(encode("ru:a:b:c"))).toBe("a:b:c");
  });

  it("is case insensitive about the scheme", () => {
    const header = encode("ru:hunter2");
    expect(appPasswordFromBasicAuth(header.replace("Basic", "basic"))).toBe(
      "hunter2",
    );
  });

  it.each([
    ["no header", null],
    ["a bearer token", "Bearer abcdef"],
    ["the scheme alone", "Basic"],
    ["no colon in the payload", `Basic ${Buffer.from("nocolon").toString("base64")}`],
  ])("returns null for %s", (_why, header) => {
    expect(appPasswordFromBasicAuth(header)).toBe(null);
  });

  it("never returns a value that would satisfy an unset password", () => {
    // The two halves have to agree: whatever this extracts still goes
    // through verifyAppPassword, which refuses "" outright.
    delete process.env.APP_PASSWORD;
    const extracted = appPasswordFromBasicAuth(encode("ru:"));
    expect(extracted).toBe("");
    expect(verifyAppPassword(extracted ?? "")).toBe(false);
  });
});
