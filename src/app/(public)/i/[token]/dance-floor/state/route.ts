import { getDanceFloor } from "@/lib/public/queries";

/**
 * The queue as the guest's page polls it. The token is checked on every
 * call (`getDanceFloor` answers null for a bad link or a shut floor), so
 * this is no more open than the page itself, and it reads only what the
 * page shows: no household names, ever.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/i/[token]/dance-floor/state">) {
  const { token } = await context.params;
  const floor = await getDanceFloor(token);
  return Response.json(floor ?? { error: "closed" }, {
    status: floor ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
