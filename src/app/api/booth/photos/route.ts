import { z } from "zod";
import { db } from "@/db";
import { photos } from "@/db/schema";
import {
  BOOTH_UPLOADER_NAME,
  boothPhotoPath,
  isBoothConfigured,
  isBoothSessionId,
  looksLikeJpeg,
  parseTakenAt,
  verifyBoothToken,
} from "@/lib/booth";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_CONTENT_TYPE,
  isStorageConfigured,
  newObjectKey,
  putObject,
} from "@/lib/storage";

/**
 * Where the photo booth drops each finished session.
 *
 * The booth (a separate project at the venue) POSTs one multipart form
 * per session: `session` (its ID, which the guest's QR also carries),
 * `takenAt`, `width`, `height`, and two JPEGs, `photo` and `thumb`. The
 * row it makes is an ordinary album photograph with `booth_session_id`
 * set, so the album, the wall, hiding and the public image routes all
 * work on it unchanged, and `/i/booth/[id]` is how the guest finds it.
 *
 * Unlike a guest's upload this comes *through* the app rather than
 * straight to the bucket: there is one booth, not a hundred phones, and
 * the app checking the token and the bytes before anything is stored is
 * worth more than the hop it saves. The bucket's own policy still only
 * ever holds JPEGs under the issued-key shape.
 *
 * `session` is unique on the table, so a retry after a half-finished
 * attempt, or the attendant pressing "send again", replaces the objects
 * behind the same photograph rather than adding a second one - and
 * keeps `hidden` as the couple set it.
 *
 * The proxy lets this path through without a session because the booth
 * cannot hold one (`carriesOwnCredential`); the token is the lock, and
 * every answer here is JSON because the only reader is a program.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fields = z.object({
  session: z.string().refine(isBoothSessionId, "session is not a booth session ID"),
  width: z.coerce.number().int().positive().max(20000),
  height: z.coerce.number().int().positive().max(20000),
});

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

/** The 401 or 503 that stops a request before it is read, or null to go on. */
function refuse(request: Request): Response | null {
  if (!isBoothConfigured()) {
    return json(503, { error: "The photo booth is not set up on this site: BOOTH_SYNC_TOKEN is unset" });
  }
  if (!verifyBoothToken(request.headers.get("authorization"))) {
    return json(401, { error: "That is not the booth's token" }, { "WWW-Authenticate": 'Bearer realm="photo booth"' });
  }
  return null;
}

/** The booth's reachability check: is the site up, and is the token right. */
export async function GET(request: Request) {
  return refuse(request) ?? json(200, { ok: true, storage: isStorageConfigured() });
}

export async function POST(request: Request) {
  const refusal = refuse(request);
  if (refusal) return refusal;
  if (!isStorageConfigured()) {
    return json(503, { error: "Photo storage is not configured on this site" });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: "Expected a multipart form" });
  }

  const parsed = fields.safeParse({
    session: form.get("session"),
    width: form.get("width"),
    height: form.get("height"),
  });
  if (!parsed.success) {
    return json(400, { error: parsed.error.issues[0]?.message ?? "Bad form" });
  }

  const files = await Promise.all([readJpeg(form, "photo"), readJpeg(form, "thumb")]);
  for (const file of files) if ("error" in file) return json(400, { error: file.error });
  const [photo, thumb] = files as [Uint8Array, Uint8Array];

  const storageKey = newObjectKey();
  const thumbStorageKey = newObjectKey();
  await Promise.all([putObject(storageKey, photo), putObject(thumbStorageKey, thumb)]);

  const { session, width, height } = parsed.data;
  const takenAt = parseTakenAt(form.get("takenAt")?.toString() ?? null);
  const replacement = {
    storageKey,
    thumbStorageKey,
    contentType: UPLOAD_CONTENT_TYPE,
    byteSize: photo.byteLength,
    width,
    height,
  };
  const [row] = await db
    .insert(photos)
    .values({
      ...replacement,
      boothSessionId: session,
      uploaderName: BOOTH_UPLOADER_NAME,
      ...(takenAt ? { createdAt: takenAt } : {}),
    })
    // Only the objects and their dimensions change on a resend. The
    // place in the album (createdAt) and whether the couple hid it stay.
    .onConflictDoUpdate({ target: photos.boothSessionId, set: replacement })
    .returning({ id: photos.id });
  if (!row) return json(500, { error: "The photograph was stored but not indexed" });

  return json(200, { id: row.id, url: boothPhotoPath(session) });
}

async function readJpeg(form: FormData, name: string): Promise<Uint8Array | { error: string }> {
  const file = form.get(name);
  if (!(file instanceof File)) return { error: `${name} is missing` };
  if (file.size <= 0) return { error: `${name} is empty` };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `${name} is over the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit` };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeJpeg(bytes)) return { error: `${name} is not a JPEG` };
  return bytes;
}
