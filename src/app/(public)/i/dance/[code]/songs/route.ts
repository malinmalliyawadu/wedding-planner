import { recordAttempt, type ThrottleStore } from "@/lib/auth/throttle";
import { readPhoneKey } from "@/lib/public/dance-phone";
import { isDanceFloorOpen, isDanceShareCode } from "@/lib/public/queries";
import {
  MIN_QUERY_LENGTH,
  normaliseQuery,
  searchSongs,
  SongSearchUnavailable,
} from "@/lib/song-search";
import type { SongSearchResponse } from "@/lib/songs";

/**
 * The dance floor's song search, behind the venue's QR code.
 *
 * The same catalogue search as the invitation's (`/i/[token]/songs`), and
 * for the same reason it goes through here: the code is checked first,
 * and only while requests are open, so this is not an open relay to a
 * third party. It does not annotate the reply cards' requests - the dance
 * floor marks what is on its own list instead, from the queue it already
 * holds.
 *
 * Throttled per phone, loosely, as the invitation's is per household. A
 * whole marquee shares one IP on the venue's wifi, so the address would
 * be the wrong key; a phone with no cookie yet shares one bucket, which
 * in practice is a script rather than a guest.
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

export async function GET(request: Request, context: RouteContext<"/i/dance/[code]/songs">) {
  const { code } = await context.params;
  if (!(await isDanceShareCode(code)) || !(await isDanceFloorOpen("venue"))) {
    return answer({ error: "not_found" }, { status: 404 });
  }

  const query = normaliseQuery(new URL(request.url).searchParams.get("q") ?? "");
  if (query.length < MIN_QUERY_LENGTH) return answer({ results: [] });

  const phone = (await readPhoneKey()) ?? "no-cookie";
  const verdict = recordAttempt(searchStore, phone, Date.now(), SEARCH_LIMITS);
  if (!verdict.allowed) {
    return answer(
      { error: "slow_down" },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }

  try {
    const matches = await searchSongs(query);
    return answer({ results: matches.map((match) => ({ ...match, alreadyRequested: false })) });
  } catch (error) {
    if (error instanceof SongSearchUnavailable) {
      return answer({ error: "unavailable" }, { status: 503 });
    }
    throw error;
  }
}
