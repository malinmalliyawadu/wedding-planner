import { ensurePhoneKey } from "@/lib/public/dance-phone";
import { getDanceFloorForShareCode, isDanceShareCode } from "@/lib/public/queries";

/**
 * The queue as a phone that came in by the venue's QR code polls it.
 *
 * This is also where the phone is given its cookie: a page cannot set
 * one, and the page checks in here straight after it loads, so by the
 * time anyone taps anything they have an identity to tap with. Only for
 * the current code - a stranger guessing at URLs is not handed a cookie.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/i/dance/[code]/state">) {
  const { code } = await context.params;
  const floor = (await isDanceShareCode(code))
    ? await getDanceFloorForShareCode(code, await ensurePhoneKey())
    : null;
  return Response.json(floor ?? { error: "not_found" }, {
    status: floor ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
