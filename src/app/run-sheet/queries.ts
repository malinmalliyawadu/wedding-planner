import { asc } from "drizzle-orm";
import { db } from "@/db";
import { runSheetItems, runSheetRecipients } from "@/db/schema";
import type { Recipient, RunSheetItem } from "@/lib/run-sheet";

export async function loadRunSheet(): Promise<{
  items: RunSheetItem[];
  recipients: Recipient[];
}> {
  const [itemRows, recipientRows] = await Promise.all([
    db.query.runSheetItems.findMany({
      with: { recipients: true },
      orderBy: [asc(runSheetItems.startTime)],
    }),
    db
      .select()
      .from(runSheetRecipients)
      .orderBy(asc(runSheetRecipients.sortOrder), asc(runSheetRecipients.id)),
  ]);

  return {
    items: itemRows.map((row) => ({
      id: row.id,
      startTime: row.startTime,
      endTime: row.endTime,
      title: row.title,
      detail: row.detail,
      location: row.location,
      lead: row.lead,
      recipientIds: row.recipients.map((r) => r.recipientId),
    })),
    recipients: recipientRows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      notes: r.notes,
      sortOrder: r.sortOrder,
    })),
  };
}
