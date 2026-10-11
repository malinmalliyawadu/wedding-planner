import { describe, expect, it } from "vitest";
import { coverAtSize, parseCatalogueResults } from "./song-search";

describe("parseCatalogueResults", () => {
  const hit = (id: number, title: string, artist = "ABBA") => ({
    id,
    title,
    artist: { name: artist, id: 180 },
    album: {
      title: "Gold",
      cover_small: "https://cdn.example/56.jpg",
      cover_medium: "https://cdn.example/250.jpg",
    },
  });

  it("maps the fields the picker shows and nothing else", () => {
    expect(parseCatalogueResults({ data: [hit(884025, "Dancing Queen")] })).toEqual([
      {
        externalId: "884025",
        title: "Dancing Queen",
        artist: "ABBA",
        album: "Gold",
        artwork: "https://cdn.example/56.jpg",
        cover: "https://cdn.example/250.jpg",
      },
    ]);
  });

  it("skips a malformed hit and keeps the rest", () => {
    const out = parseCatalogueResults({
      data: [{ id: "nope" }, hit(1, "Waterloo"), { id: 2, title: "No artist" }],
    });
    expect(out.map((s) => s.title)).toEqual(["Waterloo"]);
  });

  it("collapses the same recording under several releases into one row", () => {
    const out = parseCatalogueResults({
      data: [hit(1, "Dancing Queen"), hit(2, "Dancing Queen (Remastered)"), hit(3, "Waterloo")],
    });
    expect(out.map((s) => s.externalId)).toEqual(["1", "3"]);
  });

  it("returns nothing for a payload it does not recognise", () => {
    expect(parseCatalogueResults(null)).toEqual([]);
    expect(parseCatalogueResults({ error: { code: 4 } })).toEqual([]);
  });

  it("keeps a hit but drops a cover that is not https", () => {
    // Covers are shown to every guest on the dance floor.
    const out = parseCatalogueResults({
      data: [
        {
          id: 7,
          title: "T",
          artist: { name: "A" },
          album: { cover_small: "http://cdn.example/56.jpg", cover_medium: "javascript:alert(1)" },
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].artwork).toBeNull();
    expect(out[0].cover).toBeNull();
  });

  it("copes with a hit that has no album", () => {
    expect(parseCatalogueResults({ data: [{ id: 5, title: "T", artist: { name: "A" } }] })).toEqual([
      { externalId: "5", title: "T", artist: "A", album: null, artwork: null, cover: null },
    ]);
  });
});

describe("coverAtSize", () => {
  const cdn = "https://cdn-images.dzcdn.net/images/cover/18f41ecd3781fb96bffa2b0b49955db5";

  it("asks the catalogue's CDN for the size wanted", () => {
    expect(coverAtSize(`${cdn}/250x250-000000-80-0-0.jpg`, 720)).toBe(
      `${cdn}/720x720-000000-80-0-0.jpg`,
    );
    expect(coverAtSize(`${cdn}/1000x1000-000000-80-0-0.jpg`, 144)).toBe(
      `${cdn}/144x144-000000-80-0-0.jpg`,
    );
  });

  it("leaves anything else alone", () => {
    for (const url of [
      "https://cdn.example/250x250-000000-80-0-0.jpg",
      `${cdn}/250x300-000000-80-0-0.jpg`,
      `http://cdn-images.dzcdn.net/images/cover/abc/250x250-x.jpg`,
      "https://evil.example/https://cdn-images.dzcdn.net/images/cover/abc/250x250-x.jpg",
    ]) {
      expect(coverAtSize(url, 720)).toBe(url);
    }
    expect(coverAtSize(`${cdn}/250x250-000000-80-0-0.jpg`, 0)).toBe(
      `${cdn}/250x250-000000-80-0-0.jpg`,
    );
  });
});
