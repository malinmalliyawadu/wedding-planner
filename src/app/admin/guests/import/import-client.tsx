"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, FileUp } from "lucide-react";
import { Button } from "@/components/ui";
import type { ParseResult } from "@/lib/guest-csv";
import {
  commitGuestCsv,
  previewGuestCsv,
  type CommitResult,
} from "./actions";

export function ImportClient() {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [committed, setCommitted] = useState<CommitResult | null>(null);
  const [parsing, startParsing] = useTransition();
  const [committing, startCommitting] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setCommitted(null);
    setFileName(file.name);
    file.text().then((text) => {
      setCsvText(text);
      startParsing(async () => {
        setPreview(await previewGuestCsv(text));
      });
    });
  }

  function handleCommit() {
    if (!csvText) return;
    startCommitting(async () => {
      setCommitted(await commitGuestCsv(csvText));
      setPreview(null);
      setCsvText(null);
    });
  }

  const importable =
    preview?.rows.filter((r) => !r.error && !r.duplicate).length ?? 0;
  const duplicates = preview?.rows.filter((r) => r.duplicate).length ?? 0;
  const errors = preview?.rows.filter((r) => r.error).length ?? 0;

  return (
    <div className="space-y-6">
      {committed && (
        <div className="flex items-start gap-3 rounded-lg border border-fern/25 bg-fern-tint px-5 py-4">
          <Check size={18} className="mt-0.5 shrink-0 text-fern" aria-hidden />
          <div className="text-sm text-fern">
            <p className="font-semibold">
              Imported {committed.imported} guest
              {committed.imported === 1 ? "" : "s"}
              {committed.households > 0 &&
                `, creating ${committed.households} household${committed.households === 1 ? "" : "s"}`}
              .
            </p>
            {committed.skipped > 0 && (
              <p className="mt-0.5">
                {committed.skipped} row{committed.skipped === 1 ? " was" : "s were"}{" "}
                skipped (duplicates or errors).
              </p>
            )}
            <Link
              href="/admin/guests"
              className="mt-1.5 inline-flex items-center gap-1.5 font-semibold underline underline-offset-2"
            >
              <ArrowLeft size={13} aria-hidden />
              Back to guests
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
        <p className="mx-auto mt-1.5 max-w-md text-xs text-ink-faint">
          Expected header:{" "}
          <code className="figures">
            household,first_name,last_name,side,age_bracket,dietary_notes
          </code>
        </p>
      </label>

      {parsing && <p className="text-sm text-ink-soft">Reading file…</p>}

      {preview?.fileError && (
        <div className="flex items-start gap-3 rounded-lg border border-madder/25 bg-madder-tint px-5 py-4 text-sm text-madder">
          <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          {preview.fileError}
        </div>
      )}

      {preview && !preview.fileError && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              <span className="figures font-medium text-ink">{importable}</span>{" "}
              to import
              {duplicates > 0 && (
                <>
                  {" "}
                  · <span className="figures">{duplicates}</span> duplicate
                  {duplicates === 1 ? "" : "s"} skipped
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
                : `Import ${importable} guest${importable === 1 ? "" : "s"}`}
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-hairline bg-card shadow-card">
            <table className="w-full min-w-3xl text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  {["Line", "Household", "Name", "Side", "Age", "Dietary", "Status"].map(
                    (h) => (
                      <th
                        key={h}
                        className="eyebrow px-4 py-3 font-semibold text-ink-faint"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr
                    key={row.line}
                    className={`border-b border-hairline/60 last:border-0 ${
                      row.error
                        ? "bg-madder-tint/40"
                        : row.duplicate
                          ? "text-ink-faint"
                          : ""
                    }`}
                  >
                    <td className="figures px-4 py-2 text-xs text-ink-faint">
                      {row.line}
                    </td>
                    <td className="px-4 py-2">{row.household}</td>
                    <td className="px-4 py-2">
                      {row.firstName} {row.lastName}
                    </td>
                    <td className="px-4 py-2 text-xs uppercase">{row.side}</td>
                    <td className="px-4 py-2 text-xs capitalize">
                      {row.ageBracket}
                    </td>
                    <td className="px-4 py-2 text-xs italic">
                      {row.dietaryNotes ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {row.error ? (
                        <span className="font-medium text-madder">
                          {row.error}
                        </span>
                      ) : row.duplicate ? (
                        "Already exists - skipped"
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
