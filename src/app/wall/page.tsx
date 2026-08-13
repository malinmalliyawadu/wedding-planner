import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { WallView } from "./wall-view";

/*
 * Deliberately outside the (app) group: a projector wants the picture
 * and nothing else, so this page gets no sidebar. It is still behind
 * basicauth, because only /i is exempted at the proxy - the laptop
 * driving the marquee screen signs in once and stays signed in.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The wall",
  robots: { index: false, follow: false },
};

export default async function WallPage() {
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
