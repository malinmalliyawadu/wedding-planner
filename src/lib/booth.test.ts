import { describe, expect, it } from "vitest";
import {
  boothPhotoPath,
  isBoothSessionId,
  looksLikeJpeg,
  parseTakenAt,
  verifyBoothToken,
} from "./booth";

/**
 * `verifyBoothToken` is the whole lock on the booth's side door, and
 * `isBoothSessionId` is what keeps a booth-supplied string safe in a
 * path and a storage key. Both are pinned from both directions.
 */

const TOKEN = "Kq9d1nYx2vB7pL4sT0wE8rM3uH6jZ5aC";

describe("verifyBoothToken", () => {
  it("accepts the configured token as a bearer", () => {
    expect(verifyBoothToken(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(verifyBoothToken(`bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(verifyBoothToken(`  Bearer   ${TOKEN}  `, TOKEN)).toBe(true);
  });

  it.each([
    ["no header", null],
    ["an empty header", ""],
    ["the bare token", TOKEN],
    ["a different scheme", `Basic ${TOKEN}`],
    ["a wrong token", `Bearer ${TOKEN}x`],
    ["a prefix of the token", `Bearer ${TOKEN.slice(0, -1)}`],
    ["an empty bearer", "Bearer "],
  ])("refuses %s", (_why, header) => {
    expect(verifyBoothToken(header, TOKEN)).toBe(false);
  });

  it("refuses everything when no token is configured", () => {
    // An unset token is a shut door, not a door that "" opens.
    expect(verifyBoothToken("Bearer ", undefined)).toBe(false);
    expect(verifyBoothToken("Bearer ", "")).toBe(false);
    expect(verifyBoothToken(`Bearer ${TOKEN}`, "")).toBe(false);
  });
});

describe("isBoothSessionId", () => {
  it("accepts the booth's own IDs, which are invite-token shaped", () => {
    expect(isBoothSessionId("abcdefghjkmnpqrstuvw")).toBe(true);
    expect(isBoothSessionId("2345678923")).toBe(true);
  });

  it.each([
    ["too short", "abc"],
    ["too long", "a".repeat(65)],
    ["uppercase", "ABCDEFGHJKMNPQRSTUVW"],
    ["a slash", "abcdefgh/jkmnpqrstuv"],
    ["a dot", "abcdefgh.jkmnpqrstuv"],
    ["a traversal", "../../admin"],
    ["a space", "abcdefgh jkmnpqrstuv"],
    ["a newline", "abcdefghjkmnpqrstuvw\n"],
    ["empty", ""],
  ])("rejects %s", (_why, id) => {
    expect(isBoothSessionId(id)).toBe(false);
  });
});

describe("looksLikeJpeg", () => {
  it("recognises a JPEG's first bytes", () => {
    expect(looksLikeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(true);
  });

  it.each([
    ["a PNG", [0x89, 0x50, 0x4e, 0x47, 0x0d]],
    ["text", [0x3c, 0x68, 0x74, 0x6d, 0x6c]],
    ["too short to tell", [0xff, 0xd8, 0xff]],
    ["nothing", []],
  ])("rejects %s", (_why, bytes) => {
    expect(looksLikeJpeg(new Uint8Array(bytes))).toBe(false);
  });
});

describe("parseTakenAt", () => {
  const now = new Date("2027-02-20T19:30:00+13:00");

  it("takes a timestamp from around now", () => {
    expect(parseTakenAt("2027-02-20T06:20:00.000Z", now)).toEqual(
      new Date("2027-02-20T06:20:00.000Z"),
    );
  });

  it("ignores nothing, nonsense and a clock that is wildly wrong", () => {
    expect(parseTakenAt(null, now)).toBeNull();
    expect(parseTakenAt("", now)).toBeNull();
    expect(parseTakenAt("yesterday", now)).toBeNull();
    expect(parseTakenAt("2020-01-01T00:00:00Z", now)).toBeNull();
    expect(parseTakenAt("2031-01-01T00:00:00Z", now)).toBeNull();
  });
});

describe("boothPhotoPath", () => {
  it("is under /i, so it is public like the rest of the invitation", () => {
    expect(boothPhotoPath("abcdefghjkmnpqrstuvw")).toBe("/i/booth/abcdefghjkmnpqrstuvw");
  });
});
