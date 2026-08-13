import { describe, expect, it } from "vitest";
import {
  TOKEN_LENGTH,
  inviteUrl,
  isInviteTokenShape,
  newInviteToken,
} from "./invite-token";

describe("newInviteToken", () => {
  it("is the declared length", () => {
    expect(newInviteToken()).toHaveLength(TOKEN_LENGTH);
  });

  it("never emits a confusable character", () => {
    // The pairs that break transcription: i/l/1 and o/0.
    const banned = /[il1o]/;
    for (let i = 0; i < 500; i++) {
      expect(newInviteToken()).not.toMatch(banned);
    }
  });

  it("uses the whole alphabet rather than a biased slice", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      for (const char of newInviteToken()) seen.add(char);
    }
    expect(seen.size).toBe(32);
  });

  it("does not repeat", () => {
    const tokens = new Set(
      Array.from({ length: 2000 }, () => newInviteToken()),
    );
    expect(tokens.size).toBe(2000);
  });

  it("produces tokens its own validator accepts", () => {
    for (let i = 0; i < 200; i++) {
      expect(isInviteTokenShape(newInviteToken())).toBe(true);
    }
  });
});

describe("isInviteTokenShape", () => {
  it("rejects the wrong length", () => {
    expect(isInviteTokenShape("abc")).toBe(false);
    expect(isInviteTokenShape("a".repeat(TOKEN_LENGTH + 1))).toBe(false);
    expect(isInviteTokenShape("")).toBe(false);
  });

  it("rejects characters outside the alphabet", () => {
    // Uppercase, the excluded letters, and anything that would need escaping
    // in a path segment.
    for (const bad of ["A", "i", "l", "o", "1", "-", "/", ".", "%"]) {
      expect(isInviteTokenShape(bad + "a".repeat(TOKEN_LENGTH - 1))).toBe(false);
    }
  });

  it("is not fooled by a valid token with something appended", () => {
    expect(isInviteTokenShape(`${newInviteToken()}/../../budget`)).toBe(false);
    expect(isInviteTokenShape(`${newInviteToken()}\n`)).toBe(false);
  });
});

describe("inviteUrl", () => {
  it("joins origin and token", () => {
    expect(inviteUrl("https://wedding.example.nz", "abcdefghjkmnpqrstuvw")).toBe(
      "https://wedding.example.nz/i/abcdefghjkmnpqrstuvw",
    );
  });

  it("does not double the slash when the origin carries one", () => {
    expect(inviteUrl("https://wedding.example.nz/", "abcdefghjkmnpqrstuvw")).toBe(
      "https://wedding.example.nz/i/abcdefghjkmnpqrstuvw",
    );
  });
});
