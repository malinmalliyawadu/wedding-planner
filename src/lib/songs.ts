/**
 * Song requests, the pure half.
 *
 * A household may ask the band for up to three songs on the reply card.
 * Most are picked from an autocomplete over a music catalogue, some are
 * typed because the catalogue did not have them or was not answering,
 * and the couple want to know when two households asked for the same
 * one. Everything here is what "the same one" means and how a submitted
 * list is tidied; nothing here touches the network or the database.
 */

/** Optional, and never more than this. Three is a request; ten is a set list. */
export const MAX_SONG_REQUESTS = 3;

/** Longest title or artist that is stored. Anything longer is not a song. */
export const MAX_SONG_TEXT = 200;

export type SongRequest = {
  title: string;
  /** Null when the request was typed rather than picked. */
  artist: string | null;
  /** The catalogue's track id when picked, so provenance survives. */
  externalId: string | null;
};

/** A song the catalogue found, as the autocomplete offers it. */
export type SongMatch = {
  externalId: string;
  title: string;
  artist: string;
  album: string | null;
  /** A small cover image, for telling the single from the live album. */
  artwork: string | null;
};

/**
 * Version tags a catalogue hangs off a title: "(Remastered 2011)",
 * "[Live]", "- Radio Edit". Two households asking for the single and the
 * remaster asked for the same song, and the band plays it once.
 *
 * A bracketed suffix is always a tag. A dashed one is only a tag when it
 * says so - "ABBA - Dancing Queen" typed on the card is an artist and a
 * title, not a title and a version.
 */
const BRACKETED_SUFFIX = /\s*(\([^()]*\)|\[[^\[\]]*\])\s*$/;
const DASHED_SUFFIX = /\s+-\s+([^-]*)$/;
const VERSION_WORDS =
  /\b(remaster(?:ed)?|live|edit|version|mix|remix|mono|stereo|acoustic|demo|instrumental|deluxe|extended|radio|feat\.?|ft\.?|featuring|\d{4})\b/i;

function stripVersionTags(title: string): string {
  let bare = title.trim();
  // Repeatedly: "Song (Live) [Remastered]" carries two.
  for (;;) {
    let next = bare.replace(BRACKETED_SUFFIX, "");
    const dashed = DASHED_SUFFIX.exec(next);
    if (dashed && VERSION_WORDS.test(dashed[1])) {
      next = next.slice(0, dashed.index);
    }
    if (next === bare || next.trim() === "") return bare;
    bare = next;
  }
}

function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The identity of a song for matching purposes.
 *
 * Case, punctuation, diacritics and version tags are dropped, and the
 * words of the title and artist are sorted together, so "ABBA - Dancing
 * Queen" typed by one household and "Dancing Queen" by ABBA picked by
 * another come out equal. A typed request with no artist keys on the
 * title alone, and so does not match a picked one - "Hallelujah" on its
 * own is not a song the band can be sure of, and it is right not to
 * pretend otherwise.
 */
export function songKey(title: string, artist: string | null): string {
  return [...words(stripVersionTags(title)), ...words(artist ?? "")]
    .sort()
    .join(" ");
}

export function sameSong(
  a: { title: string; artist: string | null },
  b: { title: string; artist: string | null },
): boolean {
  return songKey(a.title, a.artist) === songKey(b.title, b.artist);
}

/** The band's line for a request: the title, and the artist if known. */
export function describeSong(song: { title: string; artist: string | null }): string {
  return song.artist ? `${song.title} - ${song.artist}` : song.title;
}

/** One line of whitespace, trimmed, and never longer than is stored. */
export function cleanSongText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SONG_TEXT);
}

/**
 * Tidy a submitted list: trim, drop blanks, drop repeats (the first
 * mention wins) and cap it. The order is kept, because the first song a
 * household thought of is the one they most want to hear.
 */
export function normaliseSongRequests(input: SongRequest[]): SongRequest[] {
  const kept: SongRequest[] = [];
  for (const raw of input) {
    const title = cleanSongText(raw.title);
    if (title === "") continue;
    const artist = cleanSongText(raw.artist) || null;
    const externalId = cleanSongText(raw.externalId) || null;
    const song = { title, artist, externalId };
    if (kept.some((other) => sameSong(other, song))) continue;
    kept.push(song);
    if (kept.length === MAX_SONG_REQUESTS) break;
  }
  return kept;
}

/** A catalogue hit with what the server knows about it. */
export type SongSearchResult = SongMatch & {
  /** Another household has already asked for this one. Whose is not said. */
  alreadyRequested: boolean;
};

/** What `/i/[token]/songs` answers with. */
export type SongSearchResponse =
  | { results: SongSearchResult[] }
  | { error: "not_found" | "slow_down" | "unavailable" };
