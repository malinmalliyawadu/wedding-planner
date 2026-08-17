import { getVisiblePhotoObject } from "@/lib/public/queries";
import { getObject } from "@/lib/storage";

/**
 * Serves one guest photograph.
 *
 * Deliberately under /i, alongside the invitations, so the whole public
 * surface is a single path prefix and the Traefik rule that exempts it
 * from the sign-in stays one line. `photo` cannot collide with a token:
 * tokens are twenty characters and this is five.
 *
 * The bucket itself stays private and guests never hold a URL into it.
 * That is what makes hiding a photograph actually work - it is a
 * database update that takes effect on the next request, not a race
 * against a signed URL already sitting in somebody's messages.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/i/photo/[id]">,
) {
  const { id } = await context.params;
  const photo = await getVisiblePhotoObject(Number(id));
  if (!photo) return new Response("Not found", { status: 404 });

  const object = await getObject(photo.storageKey);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType,
      ...(object.contentLength
        ? { "Content-Length": String(object.contentLength) }
        : {}),
      /*
       * Private, so a shared proxy never holds a photograph that has
       * since been hidden, but cacheable in the guest's own browser for
       * an hour - scrolling the album on the night should not re-fetch
       * every image. must-revalidate keeps a hidden photo from lingering
       * past that hour.
       */
      "Cache-Control": "private, max-age=3600, must-revalidate",
    },
  });
}
