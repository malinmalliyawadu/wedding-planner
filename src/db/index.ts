import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// A single pool per process; the globalThis stash keeps dev HMR from
// opening a new pool on every reload.
const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

// No guard on DATABASE_URL here on purpose: this module is evaluated
// during `next build`, which has no database by design. The container
// runs `migrate.js` before the server, and that checks it with a clear
// message, so a misconfigured deploy fails at startup either way.
const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
