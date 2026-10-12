import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readPhoneKey } from "@/lib/public/dance-phone";
import { getCouple, getDanceFloorForShareCode } from "@/lib/public/queries";
import { danceViewport, DanceFloorScreen } from "../../../_dance-floor/screen";
import { requestSong, voteOnSong } from "./actions";

/**
 * The dance floor through the QR code at the venue - on the tables, the
 * bar, the wall. The code is a secret like an invite token (`dj_floor.
 * share_code`), so this is no more open than an invitation, and the
 * couple can retire a printed one by making another. It is also the one
 * public door that an unpublished site leaves open (`isDanceShareCode`),
 * and the floor's own switch can open it alone (`venue`).
 *
 * Nobody is named by it, so the guest is known by their phone: its cookie
 * is minted by the first poll of `./state`, not here, because a page
 * cannot set one. Until then the page reads as somebody who has asked for
 * nothing, which is true.
 *
 * `dance` is five characters and can never be an invitation token, so
 * this sits safely beside `/i/[token]`, as `/i/booth` does.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "The dance floor" };
export const viewport = danceViewport;

export default async function SharedDanceFloorPage({
  params,
}: PageProps<"/i/dance/[code]">) {
  const { code } = await params;
  const floor = await getDanceFloorForShareCode(code, await readPhoneKey());
  if (!floor) notFound();

  return (
    <DanceFloorScreen
      couple={await getCouple()}
      initial={floor}
      statePath={`/i/dance/${code}/state`}
      searchPath={`/i/dance/${code}/songs`}
      request={requestSong.bind(null, code)}
      vote={voteOnSong.bind(null, code)}
      goneHint="Scan the QR code at the venue again."
    />
  );
}
