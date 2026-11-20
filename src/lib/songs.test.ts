import { describe, expect, it } from "vitest";
import {
  MAX_SONG_REQUESTS,
  buildPlaylist,
  coverFor,
  describeSong,
  normaliseSongRequests,
  sameSong,
  sameSongLoosely,
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

describe("sameSongLoosely", () => {
  const deezer = { title: "Jai Ho! (You Are My Destiny)", artist: "A. R. Rahman" };
  const appleMusic = {
    title: "Jai Ho! (You Are My Destiny) [feat. Nicole Scherzinger]",
    artist: "A.R. Rahman & The Pussycat Dolls",
  };

  it("matches when one side credits more artists, either way round", () => {
    expect(sameSong(deezer, appleMusic)).toBe(false);
    expect(sameSongLoosely(deezer, appleMusic)).toBe(true);
    expect(sameSongLoosely(appleMusic, deezer)).toBe(true);
  });

  it("matches everything sameSong does", () => {
    expect(sameSongLoosely({ title: "ABBA - Dancing Queen", artist: null }, { title: "Dancing Queen", artist: "ABBA" })).toBe(true);
  });

  it("still needs the title to agree", () => {
    expect(sameSongLoosely({ title: "Waterloo", artist: "ABBA" }, { title: "Dancing Queen", artist: "ABBA & Friends" })).toBe(false);
  });

  it("needs the shorter credit to appear whole and in order", () => {
    // Every word of "Isley Brothers" is there, but not as a run.
    expect(
      sameSongLoosely({ title: "Shout", artist: "Isley Brothers" }, { title: "Shout", artist: "Isley & The Brothers Four" }),
    ).toBe(false);
    expect(sameSongLoosely({ title: "Dancing Queen", artist: "ABBA" }, { title: "Dancing Queen", artist: "Glee Cast" })).toBe(false);
  });

  it("does not match a bare title against one with an artist", () => {
    expect(sameSongLoosely({ title: "Hallelujah", artist: null }, { title: "Hallelujah", artist: "Jeff Buckley" })).toBe(false);
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

describe("buildPlaylist", () => {
  it("lists a song once however many households asked, most asked first", () => {
    const playlist = buildPlaylist([
      { householdId: 1, title: "Waterloo", artist: "ABBA" },
      { householdId: 2, title: "Dancing Queen", artist: "ABBA" },
      { householdId: 3, title: "Dancing Queen (Live)", artist: "ABBA" },
      { householdId: 1, title: "Dancing Queen", artist: "ABBA" },
    ]);
    expect(playlist.map((song) => [song.title, song.householdIds])).toEqual([
      ["Dancing Queen", [2, 3, 1]],
      ["Waterloo", [1]],
    ]);
  });

  it("breaks ties by title so the list does not shuffle between loads", () => {
    const playlist = buildPlaylist([
      { householdId: 1, title: "Zebra", artist: null },
      { householdId: 2, title: "Apple", artist: null },
    ]);
    expect(playlist.map((song) => song.title)).toEqual(["Apple", "Zebra"]);
  });

  it("shows the picked form when a typed request matches it", () => {
    // Typed first, picked second: the line still reads title and artist
    // apart, because that is the form that knows which is which.
    const [song] = buildPlaylist([
      { householdId: 1, title: "ABBA - Dancing Queen", artist: null },
      { householdId: 2, title: "Dancing Queen", artist: "ABBA" },
    ]);
    expect(song).toEqual({
      title: "Dancing Queen",
      artist: "ABBA",
      householdIds: [1, 2],
    });
  });

  it("counts a household once for a song it asked for twice", () => {
    const [song] = buildPlaylist([
      { householdId: 1, title: "Waterloo", artist: "ABBA" },
      { householdId: 1, title: "Waterloo [Remastered]", artist: "ABBA" },
    ]);
    expect(song.householdIds).toEqual([1]);
  });

  it("is empty for no requests", () => {
    expect(buildPlaylist([])).toEqual([]);
  });
});

describe("describeSong", () => {
  it("writes the playlist's line", () => {
    expect(describeSong({ title: "Waterloo", artist: "ABBA" })).toBe("Waterloo - ABBA");
    expect(describeSong({ title: "Waterloo", artist: null })).toBe("Waterloo");
  });
});

describe("coverFor", () => {
  const match = (title: string, artist: string, cover: string | null, artwork: string | null = null) => ({
    externalId: "1",
    title,
    artist,
    album: null,
    artwork,
    cover,
  });

  it("takes the cover of the same song", () => {
    const matches = [
      match("Dancing Queen (Glee Cast Version)", "Glee Cast", "https://c/glee.jpg"),
      match("Dancing Queen", "ABBA", "https://c/abba.jpg"),
    ];
    // The Glee version's key is the same title, but a different artist.
    expect(coverFor(matches, { title: "Dancing Queen", artist: "ABBA" })).toBe("https://c/abba.jpg");
  });

  it("matches a typed request that names the artist", () => {
    expect(
      coverFor([match("Dancing Queen", "ABBA", "https://c/abba.jpg")], { title: "ABBA - Dancing Queen", artist: null }),
    ).toBe("https://c/abba.jpg");
  });

  it("gives no cover rather than a guess", () => {
    const matches = [match("Hallelujah", "Jeff Buckley", "https://c/jb.jpg")];
    expect(coverFor(matches, { title: "Hallelujah", artist: null })).toBeNull();
    expect(coverFor([], { title: "Anything", artist: "Anyone" })).toBeNull();
  });

  it("takes the cover of the same song credited to fewer artists", () => {
    // A song the DJ played arrives with Apple Music's longer credits.
    expect(
      coverFor([match("Jai Ho! (You Are My Destiny)", "A.R. Rahman", "https://c/jaiho.jpg")], {
        title: "Jai Ho! (You Are My Destiny) [feat. Nicole Scherzinger]",
        artist: "A.R. Rahman & The Pussycat Dolls",
      }),
    ).toBe("https://c/jaiho.jpg");
  });

  it("prefers an exact match to a loose one", () => {
    const matches = [
      match("Shout", "The Isley Brothers & Friends", "https://c/loose.jpg"),
      match("Shout", "The Isley Brothers", "https://c/exact.jpg"),
    ];
    expect(coverFor(matches, { title: "Shout", artist: "The Isley Brothers" })).toBe("https://c/exact.jpg");
  });

  it("falls back to the small cover when there is no large one", () => {
    expect(
      coverFor([match("Waterloo", "ABBA", null, "https://c/56.jpg")], { title: "Waterloo", artist: "ABBA" }),
    ).toBe("https://c/56.jpg");
  });
});
