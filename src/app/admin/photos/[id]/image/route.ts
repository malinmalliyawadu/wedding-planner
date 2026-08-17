import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { getObject } from "@/lib/storage";

/**
 * Serves a photograph to the couple, hidden ones included.
 *
 * The public route at /i/photo/[id] deliberately refuses anything
 * hidden, which is what makes hiding work - but it also means the couple
 * could not see what they had hidden in order to unhide it. This route
 * is the counterpart, and it sits behind the same sign-in as the guest
 * list and the budget.
 *
 * A route handler renders no layout, so the guard the planner's pages get
 * for free is written out here. The proxy has already refused an
 * unauthenticated request; this is the same second lock the layout is.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/admin/photos/[id]/image">,
) {
  await requireAdmin();

  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return new Response("Not found", { status: 404 });
  }

  const [row] = await db
    .select({ storageKey: photos.storageKey, contentType: photos.contentType })
    .from(photos)
    .where(eq(photos.id, id))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });

  const object = await getObject(row.storageKey);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType,
      ...(object.contentLength
        ? { "Content-Length": String(object.contentLength) }
        : {}),
      "Cache-Control": "private, max-age=3600, must-revalidate",
    },
  });
}
