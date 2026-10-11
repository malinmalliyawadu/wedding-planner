import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { households } from "@/db/schema";
import { Chip, EmptyState, PageHeader } from "@/components/ui";
import {
  bridgeHealth,
  getFloor,
  isBridgeConfigured,
  loadQueue,
  recentHistory,
  type QueueRow,
} from "@/lib/dj-floor";
import { tally, upcoming } from "@/lib/dj-queue";
import { describeSong } from "@/lib/songs";
import {
  ActButton,
  AddSongForm,
  AutoRefresh,
  OpenToggle,
  ThresholdForm,
} from "./controls";

export const dynamic = "force-dynamic";

/**
 * The dance floor from behind the decks.
 *
 * The guests' page shows the queue without names; this one says who asked
 * for what, which songs djay could not find, and whether the laptop
 * running the bridge is still checking in. Everything a guest can do, the
 * couple can overrule from here: skip, remove, mark what is on air.
 */
export default async function DanceFloorAdminPage() {
  const [floor, { items, votes }, history] = await Promise.all([
    getFloor(),
    loadQueue(),
    recentHistory(),
  ]);

  const householdIds = [
    ...new Set(
      [...items, ...history]
        .map((item) => item.householdId)
        .filter((id): id is number => id !== null),
    ),
  ];
  const names = new Map(
    householdIds.length === 0
      ? []
      : (
          await db
            .select({ id: households.id, name: households.name })
            .from(households)
            .where(inArray(households.id, householdIds))
        ).map((h) => [h.id, h.name]),
  );
  const who = (item: QueueRow) =>
    item.householdId === null ? "You / the DJ" : (names.get(item.householdId) ?? "A household");

  const skipVotes = tally(votes, "skip");
  const playing = items.find((item) => item.status === "playing") ?? null;
  const cued = items.filter((item) => item.status === "cued").sort((a, b) => a.id - b.id);
  const help = items.filter((item) => item.status === "needs_help").sort((a, b) => a.id - b.id);
  const waiting = upcoming(items, votes);

  const bridge = bridgeHealth(floor);

  return (
    <>
      <AutoRefresh />
      <PageHeader eyebrow="On the night" title="Dance floor">
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          Guests ask for songs and vote from their invitation links. The
          bridge on the DJ laptop hands djay Pro one request at a time and
          presses Skip when enough of them vote a song off. Anything djay
          cannot find waits here, and for Claude, under “Needs a hand”.
        </p>
      </PageHeader>

      <div className="space-y-8">
        <OpenToggle open={floor.open} />

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-hairline bg-card p-5">
            <p className="eyebrow text-ink-faint">The bridge</p>
            {!isBridgeConfigured() ? (
              <p className="mt-2 text-sm text-madder">
                DJ_BRIDGE_TOKEN is not set on this deployment, so the laptop
                cannot connect. See the dance floor section of DEPLOYMENT.md.
              </p>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">
                <span className={bridge.live ? "text-fern" : "text-madder"}>
                  {bridge.live ? "Connected" : bridge.agoMs === null ? "Never connected" : "Not heard from"}
                </span>
                {bridge.agoMs !== null && (
                  <>
                    {" · last checked in "}
                    <span className="figures">{formatAgo(bridge.agoMs)}</span>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-hairline bg-card p-5">
            <ThresholdForm value={floor.skipVotesNeeded} />
          </div>
        </section>

        <section>
          <h2 className="eyebrow mb-2 text-brass">On air</h2>
          {playing ? (
            <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <Cover url={playing.coverUrl} className="size-16" />
                <div className="min-w-0">
                  <p className="font-display text-xl text-ink">{describeSong(playing)}</p>
                  <p className="mt-1 text-sm text-ink-soft">
                    {who(playing)} ·{" "}
                    <span className="figures">{skipVotes.get(playing.id) ?? 0}</span> of{" "}
                    <span className="figures">{floor.skipVotesNeeded}</span> votes to skip
                    {playing.skipRequested && <span className="text-madder"> · skipping</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActButton kind="skip" itemId={playing.id} variant="danger">
                  Skip it
                </ActButton>
                <ActButton kind="nothingOn">Nothing is on</ActButton>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-faint">
              Nothing the bridge recognises. If it cannot read djay&rsquo;s
              decks, mark a song as on air from the list below.
            </p>
          )}
        </section>

        {help.length > 0 && (
          <section>
            <h2 className="eyebrow mb-2 text-madder">Needs a hand</h2>
            <ul className="divide-y divide-hairline rounded-lg border border-madder/30 bg-madder-tint/30">
              {help.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-ink">{describeSong(item)}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {who(item)}
                      {item.note && <> · {item.note}</>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ActButton kind="found" itemId={item.id}>
                      It&rsquo;s on djay&rsquo;s deck
                    </ActButton>
                    <ActButton kind="giveUp" itemId={item.id} variant="danger">
                      Give up
                    </ActButton>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <h2 className="eyebrow text-brass">Up next</h2>
            <ActButton
              kind="importReplies"
              variant="ghost"
              confirmText="Add every song from the reply cards to the queue, with a vote from each household that asked for it?"
            >
              Add the reply cards&rsquo; songs
            </ActButton>
          </div>
          {cued.length === 0 && waiting.length === 0 ? (
            <EmptyState
              title="Nothing waiting"
              hint="Songs guests ask for appear here, most voted first."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-hairline bg-card">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs text-ink-faint">
                    <th className="px-4 py-2 font-medium">Song</th>
                    <th className="px-4 py-2 font-medium">Asked by</th>
                    <th className="px-4 py-2 text-right font-medium">Votes</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {cued.map((item) => (
                    <tr key={item.id} className="group">
                      <td className="px-4 py-2.5 text-ink">
                        <div className="flex items-center gap-3">
                          <Cover url={item.coverUrl} className="size-8" />
                          <span>
                            {describeSong(item)}{" "}
                            <Chip tone="fern">in djay</Chip>
                            {item.skipRequested && <Chip tone="madder">will skip</Chip>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-ink-soft">{who(item)}</td>
                      <td className="px-4 py-2.5 text-right text-ink-faint">-</td>
                      <td className="px-4 py-2.5">
                        <div className="row-actions flex justify-end gap-2">
                          <ActButton kind="onAir" itemId={item.id} variant="ghost">
                            On air now
                          </ActButton>
                          {!item.skipRequested && (
                            <ActButton kind="skip" itemId={item.id} variant="danger">
                              Skip when on
                            </ActButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {waiting.map((item) => (
                    <tr key={item.id} className="group">
                      <td className="px-4 py-2.5 text-ink">
                        <div className="flex items-center gap-3">
                          <Cover url={item.coverUrl} className="size-8" />
                          <span>{describeSong(item)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-ink-soft">{who(item)}</td>
                      <td className="figures px-4 py-2.5 text-right">{item.upVotes}</td>
                      <td className="px-4 py-2.5">
                        <div className="row-actions flex justify-end gap-2">
                          <ActButton kind="onAir" itemId={item.id} variant="ghost">
                            On air now
                          </ActButton>
                          <ActButton kind="skip" itemId={item.id} variant="danger">
                            Remove
                          </ActButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-hairline bg-card p-5">
          <h2 className="eyebrow mb-3 text-ink-faint">Add a song yourselves</h2>
          <AddSongForm />
        </section>

        {history.length > 0 && (
          <section>
            <h2 className="eyebrow mb-2 text-ink-faint">Earlier</h2>
            <ul className="divide-y divide-hairline text-sm">
              {history.map((item) => (
                <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="text-ink-soft">{describeSong(item)}</span>
                  <span className="text-xs text-ink-faint">
                    {HISTORY_LABEL[item.status] ?? item.status} · {who(item)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

const HISTORY_LABEL: Partial<Record<QueueRow["status"], string>> = {
  played: "played",
  skipped: "skipped",
  removed: "removed",
  unavailable: "not found",
};

function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

/**
 * The album cover the server found for a song, or an empty square so the
 * titles still line up. A plain `<img>`: see servePhoto on why not
 * `next/image`.
 */
function Cover({ url, className }: { url: string | null; className: string }) {
  if (!url) return <span aria-hidden className={`shrink-0 rounded-sm bg-paper ${className}`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={250}
      height={250}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`shrink-0 rounded-sm bg-paper object-cover ${className}`}
    />
  );
}
