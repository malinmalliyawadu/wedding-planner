import { z } from "zod";
import { cleanSongText, sameSong, type SongMatch } from "./songs";

/**
 * The music catalogue behind the reply card's song picker.
 *
 * Deezer's public search, because it answers the question a guest is
 * actually asking - "which song" - with tracks ordered by how often
 * they are played, and asks for no key to do it. Discogs was the first
 * thought and was set aside: it catalogues *records*, so a search for
 * "Dancing Queen" returns thirteen hundred pressings of the single and
 * an album track that was never a single does not come up at all.
 *
 * This is the only file that knows which catalogue it is. The route
 * hands it a query and gets `SongMatch`es back; the picker and the
 * database never see the provider's shape, so swapping it is this file
 * and the parser in `songs.ts`.
 *
 * Every call goes through the server, never from the guest's browser:
 * the route checks the invitation token first, so the endpoint is not a
 * free proxy, and the results are annotated with what other households
 * have asked for, which only the server knows.
 */

export const SONG_CATALOGUE_NAME = "Deezer";

const ENDPOINT = "https://api.deezer.com/search";

/** Rows offered per query. A picker is not a results page. */
export const SEARCH_LIMIT = 8;

/** Fewer characters than this and every query is "the". */
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 120;

/** Give up before the guest does; the picker then offers to keep it typed. */
const TIMEOUT_MS = 4000;

/**
 * Recent answers, per process. Guests at one wedding ask for the same
 * few hundred songs, and the catalogue's rate limit is shared across
 * everyone typing at once. Bounded so a scripted stream of nonsense
 * queries cannot grow it without limit.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; matches: SongMatch[] }>();

export class SongSearchUnavailable extends Error {}

/**
 * The shape of one hit from the catalogue's search. Only the fields the
 * picker shows are named; anything else in the payload is ignored, and a
 * hit missing one of these is dropped rather than failing the search.
 */
const catalogueHit = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  artist: z.object({ name: z.string().min(1) }),
  album: z
    .object({
      title: z.string().optional(),
      cover_small: z.string().url().optional(),
    })
    .optional(),
});

const cataloguePayload = z.object({ data: z.array(z.unknown()) });

/**
 * Turn a search payload into matches. Tolerant on purpose: a third
 * party's response shape is not something this app can pin, so a hit
 * that does not fit is skipped and the rest are still offered.
 */
export function parseCatalogueResults(payload: unknown): SongMatch[] {
  const parsed = cataloguePayload.safeParse(payload);
  if (!parsed.success) return [];
  const matches: SongMatch[] = [];
  for (const raw of parsed.data.data) {
    const hit = catalogueHit.safeParse(raw);
    if (!hit.success) continue;
    const song: SongMatch = {
      externalId: String(hit.data.id),
      title: cleanSongText(hit.data.title),
      artist: cleanSongText(hit.data.artist.name),
      album: cleanSongText(hit.data.album?.title) || null,
      artwork: hit.data.album?.cover_small ?? null,
    };
    // The same recording turns up under several releases; one row each.
    if (matches.some((other) => sameSong(other, song))) continue;
    matches.push(song);
  }
  return matches;
}

/** What the guest typed, made safe to look up and to key a cache on. */
export function normaliseQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

/**
 * Songs matching a query, most played first. Throws
 * `SongSearchUnavailable` when the catalogue cannot be reached or does
 * not answer in time, so the route can say so rather than pretend the
 * song does not exist.
 */
export async function searchSongs(rawQuery: string): Promise<SongMatch[]> {
  const query = normaliseQuery(rawQuery);
  if (query.length < MIN_QUERY_LENGTH) return [];

  const key = query.toLowerCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.matches;

  const url = new URL(ENDPOINT);
  url.searchParams.set("q", query);
  // Ask for more than shown: near-duplicate releases collapse in the parser.
  url.searchParams.set("limit", String(SEARCH_LIMIT * 2));

  let payload: unknown;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new SongSearchUnavailable(`catalogue answered ${response.status}`);
    payload = await response.json();
  } catch (error) {
    throw error instanceof SongSearchUnavailable
      ? error
      : new SongSearchUnavailable("catalogue unreachable", { cause: error });
  }

  const matches = parseCatalogueResults(payload).slice(0, SEARCH_LIMIT);

  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Maps iterate in insertion order, so the first key is the oldest.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: now, matches });
  return matches;
}
