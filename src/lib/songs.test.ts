import { describe, expect, it } from "vitest";
import {
  MAX_SONG_REQUESTS,
  describeSong,
  normaliseSongRequests,
  sameSong,
  songKey,
} from "./songs";

describe("songKey", () => {
  it("ignores case, punctuation and diacritics", () => {
    expect(songKey("Mr. Brightside", "The Killers")).toBe(
      songKey("mr brightside", "the killers"),
    );
    expect(songKey("Pōhutukawa", "Kōwhai")).toBe(songKey("Pohutukawa", "Kowhai"));
    expect(songKey("Rock & Roll", null)).toBe(songKey("Rock and Roll", null));
  });

  it("does not care which order the words came in", () => {
    // A typed "ABBA - Dancing Queen" and a picked Dancing Queen by ABBA.
    expect(songKey("ABBA - Dancing Queen", null)).toBe(
      songKey("Dancing Queen", "ABBA"),
    );
  });

  it("drops version tags off the end of a title", () => {
    const single = songKey("Dancing Queen", "ABBA");
    expect(songKey("Dancing Queen (Live at Wembley)", "ABBA")).toBe(single);
    expect(songKey("Dancing Queen [Remastered]", "ABBA")).toBe(single);
    expect(songKey("Dancing Queen - Radio Edit", "ABBA")).toBe(single);
    expect(songKey("Dancing Queen (Live) [2008 Remaster]", "ABBA")).toBe(single);
  });

  it("keeps a leading parenthetical, which is part of the name", () => {
    expect(songKey("(What's the Story) Morning Glory?", "Oasis")).toContain(
      "story",
    );
  });

  it("does not empty a title that is nothing but brackets", () => {
    expect(songKey("(Untitled)", null)).toBe("untitled");
  });

  it("does not match a bare title against one with an artist", () => {
    expect(sameSong({ title: "Hallelujah", artist: null }, { title: "Hallelujah", artist: "Jeff Buckley" })).toBe(false);
  });
});

describe("normaliseSongRequests", () => {
  it("trims, drops blanks and caps the list in order", () => {
    const out = normaliseSongRequests([
      { title: "  One  ", artist: " A ", externalId: null },
      { title: "   ", artist: null, externalId: null },
      { title: "Two", artist: null, externalId: "2" },
      { title: "Three", artist: null, externalId: null },
      { title: "Four", artist: null, externalId: null },
    ]);
    expect(out).toHaveLength(MAX_SONG_REQUESTS);
    expect(out.map((s) => s.title)).toEqual(["One", "Two", "Three"]);
    expect(out[0].artist).toBe("A");
    expect(out[1].externalId).toBe("2");
  });

  it("keeps the first of two requests for the same song", () => {
    const out = normaliseSongRequests([
      { title: "Dancing Queen", artist: "ABBA", externalId: "1" },
      { title: "Dancing Queen (Live)", artist: "ABBA", externalId: "9" },
      { title: "Waterloo", artist: "ABBA", externalId: null },
    ]);
    expect(out.map((s) => s.externalId)).toEqual(["1", null]);
  });

  it("turns an empty artist into null", () => {
    expect(normaliseSongRequests([{ title: "X", artist: "", externalId: "" }])).toEqual([
      { title: "X", artist: null, externalId: null },
    ]);
  });
});

describe("describeSong", () => {
  it("writes the band's line", () => {
    expect(describeSong({ title: "Waterloo", artist: "ABBA" })).toBe("Waterloo - ABBA");
    expect(describeSong({ title: "Waterloo", artist: null })).toBe("Waterloo");
  });
});
