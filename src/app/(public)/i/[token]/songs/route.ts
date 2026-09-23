import { recordAttempt, type ThrottleStore } from "@/lib/auth/throttle";
import {
  getHouseholdIdForToken,
  getSongsRequestedElsewhere,
} from "@/lib/public/queries";
import {
  MIN_QUERY_LENGTH,
  normaliseQuery,
  searchSongs,
  SongSearchUnavailable,
} from "@/lib/song-search";
import { songKey, type SongSearchResponse } from "@/lib/songs";

/**
 * The song picker's search, behind the invitation link.
 *
 * The catalogue is asked from here rather than from the guest's browser
 * for two reasons. The token is checked first, so this is a search for
 * people holding an invitation and not an open relay to a third party.
 * And the answer is annotated with what other households have already
 * asked for, which only the server can know - the picker shows "already
 * on the list" without ever being told whose list.
 *
 * Throttled per token, loosely: a fast typist behind the picker's
 * debounce makes a few dozen requests a minute, and the ceiling exists
 * for a script, not a guest. A household that trips it is told to slow
 * down and nobody else notices.
 */
export const dynamic = "force-dynamic";

const searchStore: ThrottleStore = new Map();
const SEARCH_LIMITS = { max: 90, windowMs: 60 * 1000 };

const NO_STORE = { "Cache-Control": "no-store" };

function answer(body: SongSearchResponse, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    headers: { ...NO_STORE, ...init?.headers },
  });
}

export async function GET(request: Request, context: RouteContext<"/i/[token]/songs">) {
  const { token } = await context.params;
  const householdId = await getHouseholdIdForToken(token);
  if (householdId === null) return answer({ error: "not_found" }, { status: 404 });

  const query = normaliseQuery(new URL(request.url).searchParams.get("q") ?? "");
  if (query.length < MIN_QUERY_LENGTH) return answer({ results: [] });

  const verdict = recordAttempt(searchStore, token, Date.now(), SEARCH_LIMITS);
  if (!verdict.allowed) {
    return answer(
      { error: "slow_down" },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }

  try {
    const [matches, elsewhere] = await Promise.all([
      searchSongs(query),
      getSongsRequestedElsewhere(householdId),
    ]);
    return answer({
      results: matches.map((match) => ({
        ...match,
        alreadyRequested: elsewhere.has(songKey(match.title, match.artist)),
      })),
    });
  } catch (error) {
    if (error instanceof SongSearchUnavailable) {
      return answer({ error: "unavailable" }, { status: 503 });
    }
    throw error;
  }
}
