import { getDanceFloorForHousehold } from "@/lib/public/queries";

/**
 * The queue as the guest's page polls it. The token is checked on every
 * call (`getDanceFloorForHousehold` answers null for a bad link), so this
 * is no more open than the page itself, and it reads only what the page
 * shows: no household names, ever. A shut floor is an answer, not a 404 -
 * the page waits for it to open.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/i/[token]/dance-floor/state">) {
  const { token } = await context.params;
  const floor = await getDanceFloorForHousehold(token);
  return Response.json(floor ?? { error: "not_found" }, {
    status: floor ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
