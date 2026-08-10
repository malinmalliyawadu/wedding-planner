import path from "node:path";
import PDFDocument from "pdfkit";
import {
  daySpan,
  durationMinutes,
  formatTime,
  sortItems,
  type Recipient,
  type RunSheetItem,
} from "./run-sheet";

/**
 * Renders a recipient's run sheet as a real PDF.
 *
 * Fonts are embedded from vendored TTFs rather than the PDF standard 14,
 * whose WinAnsi encoding cannot represent a macron - "Kōwhai" would come
 * out mangled, and half this wedding is named in te reo.
 */

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
const FONTS = {
  display: path.join(FONT_DIR, "Marcellus-Regular.ttf"),
  body: path.join(FONT_DIR, "Figtree-Regular.ttf"),
  bold: path.join(FONT_DIR, "Figtree-SemiBold.ttf"),
};

// The palette, converted from the app's tokens.
const INK = "#212b25";
const INK_SOFT = "#59645d";
const INK_FAINT = "#8b948d";
const BRASS = "#7a5d24";
const HAIRLINE = "#c3bba7";

const PAGE = { size: "A4" as const, margin: 48 };
const TIME_COLUMN = 96;

export type RunSheetPdfInput = {
  recipient: Recipient | null;
  items: RunSheetItem[];
  coupleNames: string;
  weddingDate: string | null;
  /** Formatted for humans, e.g. "Sat, 20 Mar 2027". */
  weddingDateLabel: string | null;
};

export function renderRunSheetPdf(input: RunSheetPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: PAGE.size,
    margin: PAGE.margin,
    // The footer numbers pages, which means revisiting them at the end.
    bufferPages: true,
    info: {
      Title: sheetTitle(input),
      Author: input.coupleNames,
      Subject: "Wedding run sheet",
    },
  });

  doc.registerFont("display", FONTS.display);
  doc.registerFont("body", FONTS.body);
  doc.registerFont("bold", FONTS.bold);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawSheet(doc, input);
  doc.end();
  return done;
}

function sheetTitle(input: RunSheetPdfInput): string {
  return input.recipient === null
    ? `${input.coupleNames} - run sheet`
    : `${input.coupleNames} - run sheet for ${input.recipient.role}`;
}

type Doc = PDFKit.PDFDocument;

function drawSheet(doc: Doc, input: RunSheetPdfInput) {
  const { recipient, coupleNames, weddingDateLabel } = input;
  const items = sortItems(input.items);
  const left = PAGE.margin;
  const right = doc.page.width - PAGE.margin;
  const width = right - left;

  // Masthead, echoing the invitation card in the app.
  doc
    .font("body")
    .fontSize(8)
    .fillColor(BRASS)
    .text(
      (recipient?.role ?? "Everyone").toUpperCase(),
      left,
      PAGE.margin,
      { characterSpacing: 1.6 },
    );

  doc
    .font("display")
    .fontSize(26)
    .fillColor(INK)
    .text(coupleNames, left, doc.y + 4, { width });

  const subtitle = [weddingDateLabel, recipient?.name]
    .filter((part): part is string => Boolean(part))
    .join("  ·  ");
  if (subtitle) {
    doc
      .font("body")
      .fontSize(10)
      .fillColor(INK_SOFT)
      .text(subtitle, left, doc.y + 2, { width });
  }

  const span = daySpan(items);
  if (span) {
    doc
      .font("body")
      .fontSize(9)
      .fillColor(INK_FAINT)
      .text(
        `${formatTime(span.start)} to ${formatTime(span.end)}  ·  ${items.length} ${items.length === 1 ? "moment" : "moments"}`,
        left,
        doc.y + 2,
        { width },
      );
  }

  // The engraved double rule.
  let y = doc.y + 12;
  rule(doc, left, right, y, HAIRLINE, 1);
  rule(doc, left, right, y + 3, HAIRLINE, 0.5);
  y += 16;

  if (recipient?.notes) {
    y = drawNote(doc, recipient.notes, left, y, width);
  }

  if (items.length === 0) {
    doc
      .font("body")
      .fontSize(10)
      .fillColor(INK_FAINT)
      .text("Nothing on the run sheet for this one yet.", left, y + 8, { width });
    drawFooter(doc, input);
    return;
  }

  for (const item of items) {
    y = drawItem(doc, item, left, y, width);
  }

  drawFooter(doc, input);
}

function rule(
  doc: Doc,
  left: number,
  right: number,
  y: number,
  color: string,
  lineWidth: number,
) {
  doc
    .moveTo(left, y)
    .lineTo(right, y)
    .lineWidth(lineWidth)
    .strokeColor(color)
    .stroke();
}

function drawNote(
  doc: Doc,
  note: string,
  left: number,
  y: number,
  width: number,
): number {
  const padding = 10;
  const textWidth = width - padding * 2;
  const height =
    doc.font("body").fontSize(9).heightOfString(note, { width: textWidth }) +
    padding * 2;

  doc.rect(left, y, width, height).fillColor("#efe7d3").fill();
  doc
    .font("body")
    .fontSize(9)
    .fillColor(BRASS)
    .text(note, left + padding, y + padding, { width: textWidth });

  return y + height + 14;
}

/**
 * One moment: time in the left column, everything else to the right.
 * Measures first so an entry is never split across a page break.
 */
function drawItem(
  doc: Doc,
  item: RunSheetItem,
  left: number,
  y: number,
  width: number,
): number {
  const bodyLeft = left + TIME_COLUMN;
  const bodyWidth = width - TIME_COLUMN;

  const meta = [item.location, item.lead ? `Led by ${item.lead}` : null]
    .filter((part): part is string => Boolean(part))
    .join("  ·  ");

  const titleHeight = doc
    .font("bold")
    .fontSize(11)
    .heightOfString(item.title, { width: bodyWidth });
  const metaHeight = meta
    ? doc.font("body").fontSize(9).heightOfString(meta, { width: bodyWidth }) + 2
    : 0;
  const detailHeight = item.detail
    ? doc.font("body").fontSize(9.5).heightOfString(item.detail, { width: bodyWidth }) + 3
    : 0;

  const blockHeight = titleHeight + metaHeight + detailHeight + 18;
  const bottom = doc.page.height - PAGE.margin - 26;

  if (y + blockHeight > bottom) {
    doc.addPage();
    y = PAGE.margin;
  }

  const duration = durationMinutes(item);

  doc
    .font("bold")
    .fontSize(10)
    .fillColor(INK)
    .text(formatTime(item.startTime), left, y, { width: TIME_COLUMN - 12 });

  if (item.endTime !== null) {
    doc
      .font("body")
      .fontSize(8.5)
      .fillColor(INK_FAINT)
      .text(
        `to ${formatTime(item.endTime)}${duration !== null ? ` (${duration}m)` : ""}`,
        left,
        y + 13,
        { width: TIME_COLUMN - 12 },
      );
  }

  let cursor = y;
  doc
    .font("bold")
    .fontSize(11)
    .fillColor(INK)
    .text(item.title, bodyLeft, cursor, { width: bodyWidth });
  cursor += titleHeight;

  if (meta) {
    doc
      .font("body")
      .fontSize(9)
      .fillColor(BRASS)
      .text(meta, bodyLeft, cursor + 2, { width: bodyWidth });
    cursor += metaHeight;
  }

  if (item.detail) {
    doc
      .font("body")
      .fontSize(9.5)
      .fillColor(INK_SOFT)
      .text(item.detail, bodyLeft, cursor + 3, { width: bodyWidth });
    cursor += detailHeight;
  }

  const next = Math.max(cursor, y + 26) + 12;
  rule(doc, left, left + width, next - 6, "#ddd6c6", 0.5);
  return next;
}

function drawFooter(doc: Doc, input: RunSheetPdfInput) {
  const left = PAGE.margin;
  const right = doc.page.width - PAGE.margin;
  const label = sheetTitle(input);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - PAGE.margin - 12;
    doc
      .font("body")
      .fontSize(8)
      .fillColor(INK_FAINT)
      .text(label, left, y, { width: (right - left) / 2, lineBreak: false });
    doc.text(
      `${i - range.start + 1} of ${range.count}`,
      right - 100,
      y,
      { width: 100, align: "right", lineBreak: false },
    );
  }
}
