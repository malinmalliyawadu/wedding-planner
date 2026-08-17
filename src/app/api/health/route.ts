import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Liveness plus a real database round-trip. Coolify probes this from
 * inside Docker, so it bypasses any basicauth in front of
 * everything else.
 *
 * It deliberately reports whether the app can actually do its job rather
 * than merely whether the process is alive - a planner that cannot reach
 * Postgres is down as far as anyone using it is concerned.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    return Response.json(
      { status: "ok", database: "up", latencyMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        status: "degraded",
        database: "unreachable",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
