"use client";

import { Check, ChevronDown, Copy, QrCode, RefreshCw } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Button, Chip, IconButton } from "@/components/ui";
import type { HouseholdStatus } from "@/lib/rsvp-summary";
import { mintLink } from "./actions";

/**
 * One household: where it stands, its link, and - opened - its reply.
 *
 * The row is the whole of what the page says about a household. It used
 * to be said three times, in a chase list, a list of replies and a list
 * of links, so every household was on the page twice and the link to
 * nudge someone with was a screen away from the note that they needed
 * nudging. Now the status, the copy button and the reply are one row,
 * and the reply is folded away until asked for: thirty replies open at
 * once is the long page this replaces.
 *
 * The QR image is generated on the server and passed in as a data URI,
 * so nothing is fetched to draw it and the printed card and the screen
 * always show the same code. It is hidden until asked for: thirty-odd
 * QR codes on one page is a wall of noise, and the couple only need one
 * at a time - the one they are about to point a phone at.
 */
export type InviteRowData = {
  id: number;
  name: string;
  address: string | null;
  url: string | null;
  qr: string | null;
  status: HouseholdStatus;
  /** How many still owe an answer, for the summary line. */
  outstanding: number;
  /** Through the gate, infants included. */
  coming: number;
  /** When the household last replied, already worded for the page. */
  repliedAt: string | null;
  message: string | null;
  people: {
    id: number;
    name: string;
    ageBracket: "adult" | "child" | "infant";
    rsvpStatus: "pending" | "attending" | "declined";
    dietaryNotes: string | null;
  }[];
  /** What they asked for on the card, as playlist lines. */
  songs: string[];
};

const STATUS: Record<
  HouseholdStatus,
  { label: string; tone: "fern" | "brass" | "neutral" }
> = {
  replied: { label: "Replied", tone: "fern" },
  partial: { label: "Half answered", tone: "brass" },
  not_replied: { label: "No reply yet", tone: "brass" },
  no_link: { label: "No link sent", tone: "neutral" },
  empty: { label: "Nobody on it", tone: "neutral" },
};

function summarise(household: InviteRowData): string {
  const n = household.people.length;
  switch (household.status) {
    case "empty":
      return "Add people to this household on the guest list";
    case "replied":
      return `${household.coming} of ${n} coming`;
    case "partial":
      return `${household.outstanding} of ${n} still to answer`;
    default:
      return `${n} ${n === 1 ? "person" : "people"} still to answer`;
  }
}

export function InviteRow({ household }: { household: InviteRowData }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const detailId = useId();
  const status = STATUS[household.status];

  async function copy() {
    if (!household.url) return;
    try {
      await navigator.clipboard.writeText(household.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside a secure context. The link is
      // shown in the opened row and selectable, so this is not a dead end.
    }
  }

  return (
    <li className="border-t border-hairline first:border-t-0">
      <div className="flex items-center gap-2 py-3 sm:gap-3">
        {/* The name is the disclosure: the whole left of the row opens the
            reply, which on a phone is the only target big enough. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((value) => !value)}
          className="group flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left transition-colors duration-150 hover:text-ink pointer-coarse:min-h-11"
        >
          <ChevronDown
            size={15}
            aria-hidden
            className={`shrink-0 text-ink-faint transition-transform duration-200 group-hover:text-ink ${
              open ? "rotate-180" : ""
            }`}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">
              {household.name}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
              <Chip tone={status.tone}>{status.label}</Chip>
              <span>{summarise(household)}</span>
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {household.url ? (
            <>
              <IconButton
                label={copied ? "Link copied" : "Copy the link"}
                onClick={copy}
              >
                {copied ? (
                  <Check size={15} className="text-fern" aria-hidden />
                ) : (
                  <Copy size={15} aria-hidden />
                )}
              </IconButton>
              <IconButton
                label={showQr ? "Hide the QR code" : "Show the QR code"}
                aria-expanded={showQr}
                onClick={() => setShowQr((value) => !value)}
              >
                <QrCode size={15} aria-hidden />
              </IconButton>
              <IconButton
                label="Issue a new link, which stops the old one working"
                disabled={pending}
                onClick={() => {
                  if (
                    !confirm(
                      `Issue a new link for ${household.name}? The link they already have will stop working.`,
                    )
                  ) {
                    return;
                  }
                  startTransition(() => {
                    void mintLink(household.id);
                  });
                }}
              >
                <RefreshCw size={15} aria-hidden />
              </IconButton>
            </>
          ) : (
            <Button
              size="sm"
              variant="subtle"
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  void mintLink(household.id);
                })
              }
            >
              Create link
            </Button>
          )}
        </div>
      </div>

      {showQr && household.qr && (
        <div className="flex justify-center pb-4">
          <figure className="rounded-lg border border-hairline bg-white p-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URI has nothing to optimise */}
            <img
              src={household.qr}
              alt={`QR code linking to the invitation for ${household.name}`}
              width={188}
              height={188}
            />
            <figcaption className="mt-2 max-w-48 text-xs text-ink-faint">
              {household.name}. For the table card on the night, so guests
              reach the album without typing anything.
            </figcaption>
          </figure>
        </div>
      )}

      <div id={detailId} hidden={!open} className="pb-4 pl-6 sm:pl-7">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="eyebrow text-ink-faint">The link</dt>
            <dd className="mt-1">
              {household.url ? (
                <p className="figures text-xs break-all">
                  {/* A new tab, so checking a household's card never loses
                      your place in a list of thirty. */}
                  <a
                    href={household.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink-soft underline decoration-hairline-strong underline-offset-2 transition-colors duration-150 hover:text-ink hover:decoration-brass"
                  >
                    {household.url}
                  </a>
                </p>
              ) : (
                <p className="text-xs text-ink-faint">
                  No link yet - nobody in this household can reply.
                </p>
              )}
              {household.address && (
                <p className="mt-1 text-xs text-ink-faint">{household.address}</p>
              )}
            </dd>
          </div>

          {household.people.length > 0 && (
            <div>
              <dt className="eyebrow text-ink-faint">
                {household.repliedAt
                  ? `Replied ${household.repliedAt}`
                  : household.status === "replied"
                    ? "Their reply"
                    : "Who is on it"}
              </dt>
              <dd className="mt-1">
                <ul className="space-y-1.5">
                  {household.people.map((person) => (
                    <li
                      key={person.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span
                        className={
                          person.rsvpStatus === "attending"
                            ? "text-ink"
                            : person.rsvpStatus === "declined"
                              ? "text-ink-faint line-through"
                              : "text-ink-faint"
                        }
                      >
                        {person.name}
                      </span>
                      {person.ageBracket !== "adult" && (
                        <span className="text-xs text-ink-faint capitalize">
                          {person.ageBracket}
                        </span>
                      )}
                      {person.rsvpStatus === "pending" && (
                        <span className="text-xs text-ink-faint">no answer yet</span>
                      )}
                      {person.rsvpStatus === "attending" && person.dietaryNotes && (
                        <Chip tone="brass">{person.dietaryNotes}</Chip>
                      )}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}

          {household.message && (
            <div>
              <dt className="eyebrow text-ink-faint">Their note</dt>
              <dd className="mt-1 border-l-2 border-brass-tint pl-3 whitespace-pre-line text-ink-soft italic">
                {household.message}
              </dd>
            </div>
          )}

          {household.songs.length > 0 && (
            <div>
              <dt className="eyebrow text-ink-faint">Songs asked for</dt>
              <dd className="mt-1">
                <ul className="space-y-0.5 text-ink-soft">
                  {household.songs.map((song) => (
                    <li key={song}>{song}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </li>
  );
}
