import { servePhoto } from "../../serve-photo";

/** The full photograph, for the wall. See `servePhoto`. */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/admin/photos/[id]/image">,
) {
  return servePhoto((await context.params).id, "full");
}
