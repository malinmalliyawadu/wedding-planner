import { servePhoto } from "../../serve-photo";

/**
 * The small copy, for the planner's grid. A separate path rather than a
 * query parameter, as on the public album, so each size has one stable
 * URL a browser cache can treat independently. See `servePhoto`.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/admin/photos/[id]/thumb">,
) {
  return servePhoto((await context.params).id, "thumb");
}
