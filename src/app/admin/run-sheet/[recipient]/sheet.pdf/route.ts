import { formatDateShort } from "@/lib/dates";
import { getSettings } from "@/lib/queries";
import { itemsForRecipient, sortItems } from "@/lib/run-sheet";
import { renderRunSheetPdf } from "@/lib/run-sheet-pdf";
import { loadRunSheet } from "../../queries";

export const dynamic = "force-dynamic";
// pdfkit needs Node APIs; it cannot run on the edge runtime.
export const runtime = "nodejs";

/**
 * One recipient's run sheet as a PDF. `everyone` gives the master copy:
 * the whole day, including moments no supplier is assigned to.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/run-sheet/[recipient]/sheet.pdf">,
) {
  const { recipient: recipientParam } = await params;
  const [settings, { items, recipients }] = await Promise.all([
    getSettings(),
    loadRunSheet(),
  ]);

  const isEveryone = recipientParam === "everyone";
  const recipient = isEveryone
    ? null
    : (recipients.find((r) => String(r.id) === recipientParam) ?? null);

  if (!isEveryone && recipient === null) {
    return new Response("No such recipient", { status: 404 });
  }

  const sheetItems = isEveryone
    ? sortItems(items)
    : itemsForRecipient(items, recipient!.id);

  const pdf = await renderRunSheetPdf({
    recipient,
    items: sheetItems,
    coupleNames: `${settings.partnerAName} & ${settings.partnerBName}`,
    weddingDate: settings.weddingDate,
    weddingDateLabel:
      settings.weddingDate === null
        ? null
        : formatDateShort(settings.weddingDate),
  });

  const slug = isEveryone
    ? "everyone"
    : slugify(`${recipient!.role}-${recipient!.name}`);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="run-sheet-${slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
