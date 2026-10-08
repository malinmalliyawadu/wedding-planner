import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  TICKET_TTL_SECONDS,
  UPLOAD_CONTENT_TYPE,
  createUploadTicket,
  isAllowedUploadSize,
  isIssuedKey,
} from "./storage";

/**
 * `isIssuedKey` is the gate on what may be written into the photos
 * table. A guest holding a valid invite link can call the register
 * action with any string they like, so this is what stops a row being
 * created that points at an object we never issued a ticket for.
 */

const validKey = "photos/3f2504e0-4f89-41d3-9a0c-0305e82c3301.jpg";

describe("isIssuedKey", () => {
  it("accepts a key of the shape createUploadTicket issues", () => {
    expect(isIssuedKey(validKey)).toBe(true);
  });

  it.each([
    ["a different prefix", "uploads/3f2504e0-4f89-41d3-9a0c-0305e82c3301.jpg"],
    ["no prefix", "3f2504e0-4f89-41d3-9a0c-0305e82c3301.jpg"],
    ["a chosen name", "photos/mine.jpg"],
    ["a different extension", "photos/3f2504e0-4f89-41d3-9a0c-0305e82c3301.png"],
    ["uppercase hex", "photos/3F2504E0-4F89-41D3-9A0C-0305E82C3301.jpg"],
    ["a short uuid", "photos/3f2504e0-4f89-41d3-9a0c-0305e82c33.jpg"],
    ["something appended", `${validKey}.txt`],
    ["something prepended", `x${validKey}`],
    ["empty", ""],
  ])("rejects %s", (_why, key) => {
    expect(isIssuedKey(key)).toBe(false);
  });

  it("cannot be talked into leaving the photos prefix", () => {
    // The key is interpolated into an S3 request, so a traversal here
    // would reach objects outside the album's own space.
    expect(isIssuedKey("photos/../secrets.jpg")).toBe(false);
    expect(isIssuedKey("photos/3f2504e0-4f89-41d3-9a0c-0305e82c3301.jpg/../x")).toBe(
      false,
    );
  });

  it("does not let a newline smuggle a second line past the anchors", () => {
    // ^ and $ are line anchors in some regex dialects; this pins that
    // a trailing newline cannot carry an extra segment.
    expect(isIssuedKey(`${validKey}\nphotos/other.jpg`)).toBe(false);
    expect(isIssuedKey(`${validKey}\n`)).toBe(false);
  });
});

describe("upload limits", () => {
  it("only ever accepts JPEG", () => {
    // image-prep re-encodes on the device, so anything else arriving
    // means something has gone around the uploader.
    expect(UPLOAD_CONTENT_TYPE).toBe("image/jpeg");
  });

  it("caps a single upload well below a video", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(1024 * 1024);
  });
});

describe("isAllowedUploadSize", () => {
  it.each([1, 4096, MAX_UPLOAD_BYTES])("accepts %d bytes", (size) => {
    expect(isAllowedUploadSize(size)).toBe(true);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["one over the cap", MAX_UPLOAD_BYTES + 1],
    ["a fraction", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("rejects %s", (_why, size) => {
    expect(isAllowedUploadSize(size)).toBe(false);
  });
});

/**
 * Presigning needs no network - the signature is computed locally from
 * the credentials - so the shape of the URL can be pinned exactly. What
 * matters is which headers the bucket will *check*: the presigner leaves
 * Content-Type unsigned by default, and a ticket that did not sign the
 * size would let a client send any file at any length.
 */
describe("createUploadTicket", () => {
  beforeAll(() => {
    vi.stubEnv("S3_BUCKET", "test-photos");
    vi.stubEnv("S3_ACCESS_KEY_ID", "AKIATEST");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("S3_ENDPOINT", "https://account.r2.cloudflarestorage.com");
  });
  afterAll(() => vi.unstubAllEnvs());

  it("signs the type and the exact length into the URL", async () => {
    const ticket = await createUploadTicket(123_456);
    const url = new URL(ticket.url);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host",
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe(String(TICKET_TTL_SECONDS));
    expect(ticket.byteSize).toBe(123_456);
    expect(ticket.headers).toEqual({ "Content-Type": UPLOAD_CONTENT_TYPE });
  });

  it("points at the issued key in the configured bucket, path style", async () => {
    const ticket = await createUploadTicket(10);
    expect(isIssuedKey(ticket.key)).toBe(true);
    const url = new URL(ticket.url);
    expect(url.origin).toBe("https://account.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/test-photos/${ticket.key}`);
  });

  it("carries no checksum parameters R2 would refuse", async () => {
    const ticket = await createUploadTicket(10);
    const names = [...new URL(ticket.url).searchParams.keys()].map((n) => n.toLowerCase());
    expect(names.some((n) => n.includes("checksum"))).toBe(false);
  });

  it("issues a fresh key every time", async () => {
    const a = await createUploadTicket(10);
    const b = await createUploadTicket(10);
    expect(a.key).not.toBe(b.key);
  });

  it("refuses to sign a size outside the cap", async () => {
    await expect(createUploadTicket(MAX_UPLOAD_BYTES + 1)).rejects.toThrow();
    await expect(createUploadTicket(0)).rejects.toThrow();
  });
});
