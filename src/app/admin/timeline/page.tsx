import Link from "next/link";
import { asc } from "drizzle-orm";
import { CalendarDays, CircleAlert, Plus } from "lucide-react";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { DeleteButton } from "@/components/delete-button";
import { Button, Chip, EmptyState, PageHeader } from "@/components/ui";
import { formatDateShort, todayNZ } from "@/lib/dates";
import { daysBetween } from "@/lib/iso-date";
import { getSettings } from "@/lib/queries";
import { BUCKET_LABELS, bucketTasks } from "@/lib/timeline";
import { deleteTask } from "./actions";
import { GenerateButton } from "./generate-button";
import { TaskDialog, type TaskValues } from "./task-dialog";
import { TaskToggle } from "./task-toggle";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const today = todayNZ();
  const [settings, taskRows] = await Promise.all([
    getSettings(),
    db.select().from(tasks).orderBy(asc(tasks.dueDate)),
  ]);

  const { buckets, done } = bucketTasks(
    taskRows.map((t) => ({ ...t, dueDate: t.dueDate })),
    today,
  );
  const unconfirmed = taskRows.filter((t) => t.needsConfirmation && !t.done);
  const outstanding = taskRows.length - done.length;

  const addTask = (
    <TaskDialog
      nameA={settings.partnerAName}
      nameB={settings.partnerBName}
      trigger={
        <Button variant="subtle" size="sm">
          <Plus size={14} aria-hidden />
          Add a task
        </Button>
      }
    />
  );

  if (settings.weddingDate === null) {
    return (
      <>
        <PageHeader eyebrow="Between now and then" title="Timeline" />
        <EmptyState
          title="Set the wedding date first"
          hint="The plan is built backwards from the day itself, so it needs a date to count back from."
          action={
            <Link
              href="/admin/settings"
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-spine-raised"
            >
              Open settings
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Between now and then"
        title="Timeline"
        actions={taskRows.length > 0 ? addTask : undefined}
      >
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          Everything counted backwards from{" "}
          {formatDateShort(settings.weddingDate)}. Lead times are the usual
          conventions, not rules — move anything that does not suit you.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <GenerateButton hasTasks={taskRows.length > 0} />
          <a
            href="/admin/timeline/tasks.ics"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
          >
            <CalendarDays size={13} aria-hidden />
            Subscribe in your calendar
          </a>
        </div>
      </PageHeader>

      {/* Anything whose date is a guess gets said out loud, once. */}
      {unconfirmed.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-brass/30 bg-brass-tint/50 px-5 py-4">
          <CircleAlert size={16} className="mt-0.5 shrink-0 text-brass" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-ink">
              {unconfirmed.length === 1
                ? "One date is a placeholder"
                : `${unconfirmed.length} dates are placeholders`}
            </p>
            <ul className="mt-1.5 space-y-1 text-ink-soft">
              {unconfirmed.map((task) => (
                <li key={task.id}>
                  <span className="font-medium text-ink">{task.title}</span>
                  {task.notes && <> — {task.notes}</>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {taskRows.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          hint="Build the plan from the wedding date and edit it from there, or start from scratch."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <GenerateButton hasTasks={false} />
              {addTask}
            </div>
          }
        />
      ) : (
        <>
          <p className="mb-4 text-xs text-ink-soft">
            <span className="figures">{outstanding}</span> to do ·{" "}
            <span className="figures">{done.length}</span> done
          </p>

          <div className="space-y-6">
            {buckets.map(({ bucket, tasks: bucketTaskList }) => (
              <section key={bucket}>
                <h2
                  className={`eyebrow mb-2 ${bucket === "overdue" ? "text-madder" : "text-brass"}`}
                >
                  {BUCKET_LABELS[bucket]} ({bucketTaskList.length})
                </h2>
                <ul className="overflow-hidden rounded-lg border border-hairline bg-card shadow-card">
                  {bucketTaskList.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      today={today}
                      nameA={settings.partnerAName}
                      nameB={settings.partnerBName}
                      overdue={bucket === "overdue"}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {done.length > 0 && (
            <details className="mt-6 rounded-lg border border-hairline bg-card">
              <summary className="cursor-pointer px-5 py-3 text-xs text-ink-soft hover:text-ink">
                <span className="figures">{done.length}</span> done
              </summary>
              <ul className="border-t border-hairline">
                {done.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    today={today}
                    nameA={settings.partnerAName}
                    nameB={settings.partnerBName}
                    overdue={false}
                  />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </>
  );
}

type TaskRecord = typeof tasks.$inferSelect;

function TaskRow({
  task,
  today,
  nameA,
  nameB,
  overdue,
}: {
  task: TaskRecord;
  today: string;
  nameA: string;
  nameB: string;
  overdue: boolean;
}) {
  const values: TaskValues = {
    id: task.id,
    title: task.title,
    dueDate: task.dueDate,
    owner: task.owner,
    category: task.category,
    notes: task.notes,
    needsConfirmation: task.needsConfirmation,
  };

  const days = task.dueDate === null ? null : daysBetween(today, task.dueDate);

  return (
    <li className="group flex items-start gap-3 border-b border-hairline/60 px-5 py-2.5 last:border-0">
      <span className="pt-0.5">
        <TaskToggle id={task.id} done={task.done} title={task.title} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className={task.done ? "text-ink-faint line-through" : "font-medium"}>
            {task.title}
          </span>
          {task.needsConfirmation && !task.done && (
            <span className="text-xs font-medium text-brass">
              date to confirm
            </span>
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
          {task.dueDate !== null && (
            <span className={overdue ? "font-medium text-madder" : undefined}>
              {formatDateShort(task.dueDate)}
              {days !== null && !task.done && (
                <>
                  {" · "}
                  {days < 0
                    ? `${Math.abs(days)} days ago`
                    : days === 0
                      ? "today"
                      : `in ${days} days`}
                </>
              )}
            </span>
          )}
          {task.category && <span>{task.category}</span>}
        </p>
        {task.notes && (
          <p className="mt-1 max-w-2xl text-xs text-ink-soft italic">
            {task.notes}
          </p>
        )}
      </div>

      <span className="shrink-0 pt-0.5">
        <Chip
          tone={task.owner === "a" ? "sage" : task.owner === "b" ? "rose" : "neutral"}
        >
          {task.owner === "a" ? nameA : task.owner === "b" ? nameB : "Both"}
        </Chip>
      </span>

      <span className="flex shrink-0 gap-0.5 pt-0.5 row-actions">
        <TaskDialog task={values} nameA={nameA} nameB={nameB} />
        <DeleteButton
          action={deleteTask.bind(null, task.id)}
          label={`Delete ${task.title}`}
        />
      </span>
    </li>
  );
}
