import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPE, isIssuedKey } from "./storage";

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
