import { z } from "zod";
import {
  applyEvent,
  bridgeInstructions,
  isBridgeConfigured,
  recordOnAir,
  verifyBridgeToken,
} from "@/lib/dj-floor";
import { MAX_SONG_TEXT } from "@/lib/songs";

/**
 * The DJ laptop's line to the queue.
 *
 * A script on the Mac running djay Pro (`bridge/dj/`) polls this every
 * few seconds. `GET` answers what to do: hand djay the next request,
 * press Skip, or look for a song djay could not find. `POST` reports
 * what happened and answers with the next instructions, so a busy
 * moment costs one round trip rather than two.
 *
 * The bridge reports what it *sees* - the song on air - rather than what
 * it did, because the DJ can take over from the laptop at any moment and
 * the queue should follow the room (`planOnAir`).
 *
 * Like the photo booth's drop, the proxy lets this through without a
 * session (`carriesOwnCredential`) and the bearer token is the lock.
 * Every answer is JSON: the only reader is a program.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const text = z.string().trim().min(1).max(MAX_SONG_TEXT);
const optionalText = z.string().trim().max(MAX_SONG_TEXT).nullable().optional();

const report = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("on_air"),
    song: z.object({ title: text, artist: optionalText }).nullable(),
  }),
  z.object({ type: z.literal("cued"), itemId: z.number().int().positive() }),
  z.object({
    type: z.literal("cue_failed"),
    itemId: z.number().int().positive(),
    note: z.string().trim().max(500).nullable().optional(),
  }),
]);

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function refuse(request: Request): Response | null {
  if (!isBridgeConfigured()) {
    return json(503, { error: "The DJ bridge is not set up on this site: DJ_BRIDGE_TOKEN is unset" });
  }
  if (!verifyBridgeToken(request.headers.get("authorization"))) {
    return json(401, { error: "That is not the bridge's token" }, { "WWW-Authenticate": 'Bearer realm="dj bridge"' });
  }
  return null;
}

export async function GET(request: Request) {
  return refuse(request) ?? json(200, await bridgeInstructions());
}

export async function POST(request: Request) {
  const refusal = refuse(request);
  if (refusal) return refusal;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Expected a JSON body" });
  }
  const parsed = report.safeParse(body);
  if (!parsed.success) {
    return json(400, { error: parsed.error.issues[0]?.message ?? "Bad report" });
  }

  const event = parsed.data;
  let accepted = true;
  if (event.type === "on_air") {
    await recordOnAir(
      event.song ? { title: event.song.title, artist: event.song.artist ?? null } : null,
    );
  } else if (event.type === "cued") {
    accepted = await applyEvent(event.itemId, "cued");
  } else {
    accepted = await applyEvent(event.itemId, "cue_failed", event.note ?? null);
  }

  // A report that no longer applies (the couple removed the song while
  // the bridge was typing) is not an error: say so and carry on.
  return json(200, { accepted, ...(await bridgeInstructions()) });
}
