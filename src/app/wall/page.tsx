import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { WallView } from "./wall-view";

/*
 * Deliberately outside the admin group: a projector wants the picture
 * and nothing else, so this page gets no sidebar. It is still private,
 * because only `/` and `/i` are public - the laptop driving the marquee
 * screen signs in once and the session outlasts the night.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The wall",
  robots: { index: false, follow: false },
};

export default async function WallPage() {
  await requireAdmin();

  const rows = await db
    .select({
      id: photos.id,
      caption: photos.caption,
      uploaderName: photos.uploaderName,
    })
    .from(photos)
    .where(eq(photos.hidden, false))
    .orderBy(desc(photos.createdAt), desc(photos.id))
    .limit(120);

  return <WallView photos={rows} />;
}
