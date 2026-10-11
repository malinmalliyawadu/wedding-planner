import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDanceFloorForHousehold, getSiteContent } from "@/lib/public/queries";
import { danceViewport, DanceFloorScreen } from "../../../_dance-floor/screen";
import { requestSong, voteOnSong } from "./actions";

/**
 * The dance floor, through a household's invitation link: ask for a song,
 * vote the list, vote a song off. The same page as the venue's QR code
 * (`/i/dance/[code]`), with the household as the one asking and a way
 * back to the invitation.
 *
 * Like the album, no envelope - a guest gets here on the night, phone in
 * one hand and a drink in the other. A good link with the floor shut is
 * told when it opens and opens itself; only a bad link 404s.
 *
 * The page is rendered once with the true state and then keeps itself
 * current (`Floor` polls `./state`), because the point of it is what is
 * playing *now*.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "The dance floor" };
export const viewport = danceViewport;

export default async function DanceFloorPage({
  params,
}: PageProps<"/i/[token]/dance-floor">) {
  const { token } = await params;
  const [site, floor] = await Promise.all([getSiteContent(), getDanceFloorForHousehold(token)]);
  if (!site || !floor) notFound();

  return (
    <DanceFloorScreen
      couple={{ a: site.partnerAName, b: site.partnerBName }}
      initial={floor}
      statePath={`/i/${token}/dance-floor/state`}
      searchPath={`/i/${token}/songs`}
      request={requestSong.bind(null, token)}
      vote={voteOnSong.bind(null, token)}
      invitationHref={`/i/${token}`}
      goneHint="Open the link from your invitation again."
    />
  );
}
