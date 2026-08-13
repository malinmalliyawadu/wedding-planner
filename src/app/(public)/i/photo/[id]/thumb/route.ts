import { getVisiblePhotoObject } from "@/lib/public/queries";
import { getObject } from "@/lib/storage";

/**
 * The small copy, for the album's grid.
 *
 * A separate path rather than a query parameter so each size has one
 * stable URL that a browser cache and any CDN can treat independently.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/i/photo/[id]/thumb">,
) {
  const { id } = await context.params;
  const photo = await getVisiblePhotoObject(Number(id), "thumb");
  if (!photo) return new Response("Not found", { status: 404 });

  const object = await getObject(photo.storageKey);
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
