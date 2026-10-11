import { notFound } from "next/navigation";
import {
  getDanceFloor,
  getInvitation,
  getSiteContent,
} from "@/lib/public/queries";
import { Ribbon } from "../../../ribbon";
import { Section } from "../../../sections";
import { Floor } from "./floor";

/**
 * The dance floor: ask for a song, vote the list, vote a song off.
 *
 * Like the album, no envelope - a guest gets here on the night from the
 * link on their own invitation, phone in one hand and a drink in the
 * other. It exists only while the couple have it open, and 404s like any
 * other unknown page otherwise.
 *
 * The page is rendered once with the true state and then keeps itself
 * current (`Floor` polls `./state`), because the point of it is what is
 * playing *now*.
 */
export const dynamic = "force-dynamic";

export default async function DanceFloorPage({
  params,
}: PageProps<"/i/[token]/dance-floor">) {
  const { token } = await params;
  const [invitation, site, floor] = await Promise.all([
    getInvitation(token),
    getSiteContent(),
    getDanceFloor(token),
  ]);
  if (!invitation || !site || !floor) notFound();

  const initialA = (site.partnerAName[0] ?? "A").toUpperCase();
  const initialB = (site.partnerBName[0] ?? "B").toUpperCase();

  return (
    <>
      <Ribbon
        monogram={{ a: initialA, b: initialB }}
        links={[
          { id: "on-now", label: "On now" },
          { id: "ask", label: "Ask for one" },
          { id: "up-next", label: "Up next" },
        ]}
        cta={{ href: `/i/${token}`, label: "Invitation" }}
      />

      <main id="main" data-invitation="" className="overflow-x-clip pt-14 pb-20">
        <Section
          id="on-now"
          eyebrow="The dance floor"
          title="What's playing"
          intro="Ask for a song, vote up the ones you want next, and if enough of you would rather not, we'll move on."
        >
          <Floor token={token} initial={floor} />
        </Section>
      </main>
    </>
  );
}
