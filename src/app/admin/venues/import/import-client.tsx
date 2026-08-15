"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, FileUp } from "lucide-react";
import { Button } from "@/components/ui";
import { formatCentsWhole } from "@/lib/money";
import { VENUE_CSV_HEADERS, type VenueParseResult } from "@/lib/venue-csv";
import {
  commitVenueCsv,
  previewVenueCsv,
  type VenueCommitResult,
} from "./actions";

export function ImportClient() {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<VenueParseResult | null>(null);
  const [committed, setCommitted] = useState<VenueCommitResult | null>(null);
  const [parsing, startParsing] = useTransition();
  const [committing, startCommitting] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setCommitted(null);
    setFileName(file.name);
    file.text().then((text) => {
      setCsvText(text);
      startParsing(async () => {
        setPreview(await previewVenueCsv(text));
      });
    });
  }

  function handleCommit() {
    if (csvText === null) return;
    startCommitting(async () => {
      setCommitted(await commitVenueCsv(csvText));
      setPreview(null);
      setCsvText(null);
    });
  }

  const rows = preview?.rows ?? [];
  const importable = rows.filter((r) => r.error === null && !r.duplicate).length;
  const duplicates = rows.filter((r) => r.duplicate).length;
  const errors = rows.filter((r) => r.error !== null).length;

  return (
    <div className="space-y-6">
      {committed !== null && (
        <div className="flex items-start gap-3 rounded-lg border border-fern/25 bg-fern-tint px-5 py-4">
          <Check size={18} className="mt-0.5 shrink-0 text-fern" aria-hidden />
          <div className="text-sm text-fern">
            <p className="font-semibold">
              Imported {committed.imported} venue
              {committed.imported === 1 ? "" : "s"}.
            </p>
            {committed.unquoted > 0 && (
              <p className="mt-0.5">
                {committed.unquoted} of them {committed.unquoted === 1 ? "has" : "have"}{" "}
                no hire fee yet, so {committed.unquoted === 1 ? "it waits" : "they wait"}{" "}
                at the bottom of the comparison until you ring them.
              </p>
            )}
            {committed.skipped > 0 && (
              <p className="mt-0.5">
                {committed.skipped} row{committed.skipped === 1 ? " was" : "s were"}{" "}
                skipped - already on the list, or unreadable.
              </p>
            )}
            <Link
              href="/admin/venues"
              className="mt-1.5 inline-flex items-center gap-1.5 font-semibold underline underline-offset-2"
            >
              <ArrowLeft size={13} aria-hidden />
              Back to venues
            </Link>
          </div>
        </div>
      )}

      <label
        className="block cursor-pointer rounded-lg border border-dashed border-hairline-strong bg-card/60 px-8 py-10 text-center transition-colors duration-150 hover:border-brass hover:bg-brass-tint/30"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <FileUp size={20} className="mx-auto text-ink-faint" aria-hidden />
        <p className="mt-3 text-sm font-medium">
          {fileName ?? "Drop a CSV here, or click to choose"}
        </p>
        <p className="mx-auto mt-1.5 max-w-lg text-xs leading-relaxed text-ink-faint">
          A venue name is the only column it insists on. It also understands{" "}
          {/* The header is one long string with no spaces in it, which on a
              phone runs straight out of the dashed box. A <wbr> after each
              comma gives it somewhere to break that is not mid-word. */}
          <code className="figures">
            {VENUE_CSV_HEADERS.map((header, i) => (
              <Fragment key={header}>
                {i > 0 && (
                  <>
                    ,<wbr />
                  </>
                )}
                {header}
              </Fragment>
            ))}
          </code>
          , and
          common spellings of each - <span className="italic">Venue</span>,{" "}
          <span className="italic">Max seated</span>,{" "}
          <span className="italic">Venue hire</span>,{" "}
          <span className="italic">Website</span>.
        </p>
      </label>

      {parsing && <p className="text-sm text-ink-soft">Reading file…</p>}

      {preview?.fileError != null && (
        <div className="flex items-start gap-3 rounded-lg border border-madder/25 bg-madder-tint px-5 py-4 text-sm text-madder">
          <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          {preview.fileError}
        </div>
      )}

      {preview !== null && preview.fileError === null && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              <span className="figures font-medium text-ink">{importable}</span>{" "}
              to import
              {duplicates > 0 && (
                <>
                  {" "}
                  · <span className="figures">{duplicates}</span> already on the
                  list
                </>
              )}
              {errors > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span className="figures font-medium text-madder">
                    {errors}
                  </span>{" "}
                  with errors
                </>
              )}
            </p>
            <Button
              onClick={handleCommit}
              disabled={committing || importable === 0}
            >
              {committing
                ? "Importing…"
                : `Import ${importable} venue${importable === 1 ? "" : "s"}`}
            </Button>
          </div>

          {(preview.keptInNotes.length > 0 ||
            preview.cateringGuestCount !== null) && (
            // What the importer did with the rest of the file, said before
            // the button is pressed rather than discovered afterwards.
            <div className="rounded-lg border border-hairline bg-card px-5 py-4 text-xs leading-relaxed text-ink-soft shadow-card">
              {preview.keptInNotes.length > 0 && (
                <p>
                  Kept in each venue&rsquo;s notes, under their own headings:{" "}
                  <span className="text-ink">
                    {preview.keptInNotes.join(", ")}
                  </span>
                  . Nothing in the file is thrown away except totals this works
                  out for itself.
                </p>
              )}
              {preview.cateringGuestCount !== null && (
                <p className="mt-2">
                  Catering is quoted here as a total for{" "}
                  <span className="figures text-ink">
                    {preview.cateringGuestCount}
                  </span>{" "}
                  guests, so a per-head rate is divided back out of it - but
                  only where the file says the figure came from the venue. Where
                  it was your own estimate, the rate is left blank and the
                  comparison prices its own caterer in, marked as assumed.
                </p>
              )}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-hairline bg-card shadow-card">
            <table className="w-full min-w-3xl text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                    Line
                  </th>
                  <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                    Venue
                  </th>
                  <th className="eyebrow px-3 py-3 text-right font-semibold text-ink-faint">
                    Seats
                  </th>
                  <th className="eyebrow px-3 py-3 text-right font-semibold text-ink-faint">
                    Hire
                  </th>
                  <th className="eyebrow px-3 py-3 text-right font-semibold text-ink-faint">
                    Per head
                  </th>
                  <th className="eyebrow px-4 py-3 font-semibold text-ink-faint">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.line}
                    className={`border-b border-hairline/60 last:border-0 ${
                      row.error !== null
                        ? "bg-madder-tint/40"
                        : row.duplicate
                          ? "text-ink-faint"
                          : ""
                    }`}
                  >
                    <td className="figures px-4 py-2 align-top text-xs text-ink-faint">
                      {row.line}
                    </td>
                    <td className="px-4 py-2 align-top">
                      <span className="font-medium">
                        {row.values.name === "" ? "—" : row.values.name}
                      </span>
                      {row.values.locality !== null && (
                        <span className="mt-0.5 block text-xs text-ink-faint">
                          {row.values.locality}
                        </span>
                      )}
                      {row.error === null &&
                        row.warnings.map((warning) => (
                          <span
                            key={warning}
                            className="mt-0.5 block max-w-md text-xs leading-relaxed text-ink-faint"
                          >
                            {warning}
                          </span>
                        ))}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      {row.values.seatedCapacity === null ? (
                        <span className="text-xs text-ink-faint">Not said</span>
                      ) : (
                        <span className="figures">
                          {row.values.seatedCapacity}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      {row.values.hireFixedCostCents === null ? (
                        <span className="text-xs text-ink-faint">
                          Not quoted
                        </span>
                      ) : (
                        <span className="figures">
                          {formatCentsWhole(row.values.hireFixedCostCents)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      {row.values.perHeadCostCents === null ? (
                        <span className="text-xs text-brass">Caterer est.</span>
                      ) : (
                        <span className="figures">
                          {formatCentsWhole(row.values.perHeadCostCents)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top text-xs">
                      {row.error !== null ? (
                        <span className="font-medium text-madder">
                          {row.error}
                        </span>
                      ) : row.duplicate ? (
                        "Already on the list - skipped"
                      ) : (
                        <span className="text-fern">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
