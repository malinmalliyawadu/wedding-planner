import { asc } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { households, songRequests } from "@/db/schema";
import { Chip, EmptyState, PageHeader } from "@/components/ui";
import { buildPlaylist } from "@/lib/songs";

export const dynamic = "force-dynamic";

/**
 * Every song asked for on a reply card, as one list.
 *
 * Its own page rather than a section of the invitations: the invitations
 * page is about households, and this is the same facts turned the other
 * way round - by song, with the households against each - which is the
 * shape it takes when it is handed to whoever is playing the music.
 */
export default async function PlaylistPage() {
  const [householdRows, songRows] = await Promise.all([
    db
      .select({ id: households.id, name: households.name })
      .from(households),
    db.select().from(songRequests).orderBy(asc(songRequests.id)),
  ]);

  const householdName = new Map(householdRows.map((h) => [h.id, h.name]));
  const playlist = buildPlaylist(songRows);
  const askingHouseholds = new Set(songRows.map((song) => song.householdId)).size;

  return (
    <>
      <div className="mb-4">
        <Link
          href="/admin/invitations"
          className="inline-flex min-h-9 items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Invitations
        </Link>
      </div>

      <PageHeader eyebrow="The public side" title="The playlist">
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          Every song asked for on a reply card, the most requested first,
          with who asked for it. A song two households both picked is
          listed once, however differently they spelled it.
        </p>
      </PageHeader>

      {playlist.length === 0 ? (
        <EmptyState
          title="No requests yet"
          hint="Songs guests ask for on the reply card will collect here."
        />
      ) : (
        <div className="max-w-3xl">
          <p className="mb-4 text-xs text-ink-faint">
            <span className="figures">{playlist.length}</span>{" "}
            {playlist.length === 1 ? "song" : "songs"} from{" "}
            <span className="figures">{askingHouseholds}</span>{" "}
            {askingHouseholds === 1 ? "household" : "households"}
          </p>
          <ol className="rounded-lg border border-hairline bg-card px-5 shadow-card">
            {playlist.map((song, index) => (
              <li
                key={`${song.title}|${song.artist ?? ""}`}
                className="flex items-center gap-4 border-t border-hairline py-3 first:border-t-0"
              >
                <span className="figures w-6 shrink-0 text-right text-xs text-ink-faint">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{song.title}</p>
                  <p className="truncate text-xs text-ink-faint">
                    {song.artist ?? "Typed in, no artist given"}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {song.householdIds
                      .map((id) => householdName.get(id) ?? "Unknown household")
                      .join(", ")}
                  </p>
                </div>
                {song.householdIds.length > 1 && (
                  <Chip tone="brass">
                    <span className="figures">{song.householdIds.length}</span>{" "}
                    households
                  </Chip>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
