import { CircleAlert, Download, Plus } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Button, Chip, EmptyState, PageHeader } from "@/components/ui";
import { formatDateShort } from "@/lib/dates";
import { getSettings } from "@/lib/queries";
import {
  daySpan,
  durationMinutes,
  findProblems,
  formatTime,
  itemsForRecipient,
  sortItems,
} from "@/lib/run-sheet";
import { deleteRecipient, deleteRunSheetItem } from "./actions";
import { RecipientDialog, RunSheetItemDialog } from "./dialogs";
import { loadRunSheet } from "./queries";

export const dynamic = "force-dynamic";

export default async function RunSheetPage() {
  const [settings, { items, recipients }] = await Promise.all([
    getSettings(),
    loadRunSheet(),
  ]);

  const ordered = sortItems(items);
  const problems = findProblems(items);
  const span = daySpan(items);

  const addItem = (
    <RunSheetItemDialog
      recipients={recipients}
      trigger={
        <Button variant="subtle" size="sm">
          <Plus size={14} aria-hidden />
          Add a moment
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        eyebrow="The day itself"
        title="Run sheet"
        actions={items.length > 0 ? addItem : undefined}
      >
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          One canonical timeline for{" "}
          {settings.weddingDate
            ? formatDateShort(settings.weddingDate)
            : "the day"}
          . Everyone&rsquo;s PDF is this same sheet, filtered to the moments
          that concern them — change it once and every sheet follows.
        </p>
        {span && (
          <p className="mt-2 text-xs text-ink-faint">
            <span className="figures">{formatTime(span.start)}</span> to{" "}
            <span className="figures">{formatTime(span.end)}</span> ·{" "}
            <span className="figures">{items.length}</span> moments ·{" "}
            <span className="figures">{recipients.length}</span> sheets
          </p>
        )}
      </PageHeader>

      {problems.length > 0 && (
        <div className="mb-6 space-y-1.5 rounded-lg border border-madder/25 bg-madder-tint/60 px-5 py-4">
          <h2 className="eyebrow flex items-center gap-2 text-madder">
            <CircleAlert size={14} aria-hidden />
            Worth a look
          </h2>
          <ul className="space-y-1 text-sm text-ink">
            {problems.map((problem, i) => (
              <li key={i}>
                {problem.kind === "ends-before-it-starts" && (
                  <>
                    <span className="font-medium">{problem.item.title}</span>{" "}
                    finishes before it starts.
                  </>
                )}
                {problem.kind === "double-booked" && (
                  <>
                    {problem.recipientIds
                      .map(
                        (id) =>
                          recipients.find((r) => r.id === id)?.role ??
                          "Someone",
                      )
                      .join(" and ")}{" "}
                    {problem.recipientIds.length === 1 ? "is" : "are"} due at{" "}
                    <span className="font-medium">{problem.item.title}</span>{" "}
                    and <span className="font-medium">{problem.other.title}</span>{" "}
                    at the same time.
                  </>
                )}
                {problem.kind === "nobody-told" && (
                  <>
                    <span className="font-medium">{problem.item.title}</span> is
                    on nobody&rsquo;s sheet.
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The sheets themselves: one download each. */}
      <section className="mb-8 rounded-lg border border-hairline bg-card shadow-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <div>
            <h2 className="eyebrow text-brass">Sheets to hand out</h2>
            <p className="mt-1 text-xs text-ink-soft">
              Each one is the same day, filtered.
            </p>
          </div>
          <RecipientDialog
            nextSortOrder={recipients.length}
            trigger={
              <Button variant="subtle" size="sm">
                <Plus size={14} aria-hidden />
                Add a recipient
              </Button>
            }
          />
        </header>

        <ul className="divide-y divide-hairline/60">
          <li className="flex items-center gap-3 bg-paper/50 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Everyone</p>
              <p className="text-xs text-ink-faint">
                The master copy — the whole day, including anything nobody
                else is told about
              </p>
            </div>
            <span className="figures text-xs text-ink-soft">
              {items.length}
            </span>
            <a
              href="/run-sheet/everyone/sheet.pdf"
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink-faint hover:bg-white"
            >
              <Download size={13} aria-hidden />
              PDF
            </a>
          </li>

          {recipients.map((recipient) => {
            const theirs = itemsForRecipient(items, recipient.id);
            return (
              <li
                key={recipient.id}
                className="group flex items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {recipient.role}
                    <span className="ml-2 text-xs font-normal text-ink-soft">
                      {recipient.name}
                    </span>
                  </p>
                  {recipient.notes && (
                    <p className="mt-0.5 max-w-xl text-xs text-ink-faint italic">
                      {recipient.notes}
                    </p>
                  )}
                </div>
                <span
                  className={`figures text-xs ${theirs.length === 0 ? "text-madder" : "text-ink-soft"}`}
                  title={`${theirs.length} moments`}
                >
                  {theirs.length}
                </span>
                <a
                  href={`/run-sheet/${recipient.id}/sheet.pdf`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink-faint hover:bg-white"
                >
                  <Download size={13} aria-hidden />
                  PDF
                </a>
                <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <RecipientDialog
                    recipient={recipient}
                    nextSortOrder={recipient.sortOrder}
                  />
                  <DeleteButton
                    action={deleteRecipient.bind(null, recipient.id)}
                    label={`Delete ${recipient.role}`}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {ordered.length === 0 ? (
        <EmptyState
          title="The day is empty"
          hint="Add the moments that make up the day — the ceremony, the photos, when the caterer needs the kitchen."
          action={addItem}
        />
      ) : (
        <ol className="overflow-hidden rounded-lg border border-hairline bg-card shadow-card">
          {ordered.map((item) => {
            const duration = durationMinutes(item);
            const theirs = recipients.filter((r) =>
              item.recipientIds.includes(r.id),
            );
            return (
              <li
                key={item.id}
                className="group flex gap-4 border-b border-hairline/60 px-5 py-3 last:border-0"
              >
                <div className="w-28 shrink-0 pt-0.5">
                  <p className="figures text-sm font-medium">
                    {formatTime(item.startTime)}
                  </p>
                  {item.endTime && (
                    <p className="figures text-xs text-ink-faint">
                      to {formatTime(item.endTime)}
                      {duration !== null && ` · ${duration}m`}
                    </p>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  {(item.location || item.lead) && (
                    <p className="mt-0.5 text-xs text-brass">
                      {[item.location, item.lead ? `Led by ${item.lead}` : null]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </p>
                  )}
                  {item.detail && (
                    <p className="mt-1 max-w-2xl text-xs text-ink-soft">
                      {item.detail}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {theirs.length === 0 ? (
                      <span className="text-xs text-madder">
                        On nobody&rsquo;s sheet
                      </span>
                    ) : (
                      theirs.map((r) => (
                        <Chip key={r.id} tone="neutral">
                          {r.role}
                        </Chip>
                      ))
                    )}
                  </div>
                </div>

                <span className="flex shrink-0 gap-0.5 pt-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <RunSheetItemDialog item={item} recipients={recipients} />
                  <DeleteButton
                    action={deleteRunSheetItem.bind(null, item.id)}
                    label={`Delete ${item.title}`}
                  />
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-4 text-xs text-ink-faint">
        Sheets are generated fresh each time you download, so they always
        match what is above.
      </p>
    </>
  );
}
