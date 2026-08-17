import { asc } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { buildCalendar, type CalendarEvent } from "@/lib/ics";
import { getSettings } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * A subscribable calendar of everything still to do, plus the day
 * itself. Subscribing (rather than importing) means a phone re-fetches
 * this URL, so edits in the app show up in the calendar. UIDs are stable
 * per task for exactly that reason.
 *
 * **The one private route the proxy guards on its own.** Everywhere else
 * the session check is written out a second time - in the layout, or at
 * the top of the handler - but a calendar client cannot sign in with a
 * passkey, cannot fill in a form and cannot be sent to a login page: it
 * fetches this URL every few hours forever and the only credential it can
 * carry is a password in a header. So `allowsAppPasswordAuth` in
 * `src/proxy.ts` accepts HTTP Basic for this path and nothing else, and
 * repeating the check here would only be able to refuse what the proxy
 * has already allowed. `proxy.test.ts` pins both halves.
 *
 * The URL a calendar wants therefore carries the app password:
 * `https://ledger:<APP_PASSWORD>@host/admin/timeline/tasks.ics`
 */
export async function GET() {
  const [settings, taskRows] = await Promise.all([
    getSettings(),
    db.select().from(tasks).orderBy(asc(tasks.dueDate)),
  ]);

  const couple = `${settings.partnerAName} & ${settings.partnerBName}`;
  const events: CalendarEvent[] = [];

  if (settings.weddingDate !== null) {
    events.push({
      uid: "wedding-day@wedding-ledger",
      date: settings.weddingDate,
      summary: `${couple} - the wedding`,
    });
  }

  for (const task of taskRows) {
    // A task with no date has nowhere to sit in a calendar; a task that
    // is done no longer needs to shout.
    if (task.dueDate === null || task.done) continue;

    const description = [
      task.category ? `Category: ${task.category}` : null,
      `Owner: ${ownerLabel(task.owner, settings.partnerAName, settings.partnerBName)}`,
      task.needsConfirmation
        ? "This date is a placeholder and needs confirming."
        : null,
      task.notes,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    events.push({
      uid: `task-${task.id}@wedding-ledger`,
      date: task.dueDate,
      summary: task.needsConfirmation ? `${task.title} (confirm date)` : task.title,
      description,
    });
  }

  const body = buildCalendar(events, { name: `${couple} - wedding plan` });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="wedding-plan.ics"',
      // Subscribers poll this; never let a proxy serve a stale plan.
      "Cache-Control": "no-store",
    },
  });
}

function ownerLabel(
  owner: "a" | "b" | "both",
  nameA: string,
  nameB: string,
): string {
  if (owner === "a") return nameA;
  if (owner === "b") return nameB;
  return `${nameA} & ${nameB}`;
}
