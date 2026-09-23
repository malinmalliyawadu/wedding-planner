import { describe, expect, it } from "vitest";
import { parseCatalogueResults } from "./song-search";

describe("parseCatalogueResults", () => {
  const hit = (id: number, title: string, artist = "ABBA") => ({
    id,
    title,
    artist: { name: artist, id: 180 },
    album: { title: "Gold", cover_small: "https://cdn.example/56.jpg" },
  });

  it("maps the fields the picker shows and nothing else", () => {
    expect(parseCatalogueResults({ data: [hit(884025, "Dancing Queen")] })).toEqual([
      {
        externalId: "884025",
        title: "Dancing Queen",
        artist: "ABBA",
        album: "Gold",
        artwork: "https://cdn.example/56.jpg",
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

  it("copes with a hit that has no album", () => {
    expect(parseCatalogueResults({ data: [{ id: 5, title: "T", artist: { name: "A" } }] })).toEqual([
      { externalId: "5", title: "T", artist: "A", album: null, artwork: null },
    ]);
  });
});
