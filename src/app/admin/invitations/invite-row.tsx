"use client";

import { Check, Copy, QrCode, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, Chip, IconButton } from "@/components/ui";
import { mintLink } from "./actions";

/**
 * One household's invitation link.
 *
 * The QR image is generated on the server and passed in as a data URI,
 * so nothing is fetched to draw it and the printed card and the screen
 * always show the same code. It is hidden until asked for: thirty-odd
 * QR codes on one page is a wall of noise, and the couple only need one
 * at a time - the one they are about to point a phone at.
 */
export function InviteRow({
  householdId,
  name,
  address,
  url,
  qr,
  status,
}: {
  householdId: number;
  name: string;
  address: string | null;
  url: string | null;
  qr: string | null;
  status: { label: string; tone: "fern" | "brass" | "neutral" };
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [pending, startTransition] = useTransition();

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside a secure context. The link is
      // already on screen and selectable, so this is not a dead end.
    }
  }

  return (
    <li className="group border-t border-hairline py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-ink">{name}</p>
          {address && (
            <p className="mt-0.5 truncate text-xs text-ink-faint">{address}</p>
          )}
          {url ? (
            <p className="figures mt-1.5 text-xs break-all text-ink-soft">
              {url}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-ink-faint">
              No link yet - nobody in this household can reply.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Chip tone={status.tone}>{status.label}</Chip>
          {url ? (
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
                onClick={() => setShowQr((open) => !open)}
              >
                <QrCode size={15} aria-hidden />
              </IconButton>
              <IconButton
                label="Issue a new link, which stops the old one working"
                disabled={pending}
                onClick={() => {
                  if (
                    !confirm(
                      `Issue a new link for ${name}? The link they already have will stop working.`,
                    )
                  ) {
                    return;
                  }
                  startTransition(() => {
                    void mintLink(householdId);
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
                  void mintLink(householdId);
                })
              }
            >
              Create link
            </Button>
          )}
        </div>
      </div>

      {showQr && qr && (
        <div className="mt-4 flex justify-center">
          <figure className="rounded-lg border border-hairline bg-white p-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URI has nothing to optimise */}
            <img src={qr} alt={`QR code linking to the invitation for ${name}`} width={188} height={188} />
            <figcaption className="mt-2 text-xs text-ink-faint">{name}</figcaption>
          </figure>
        </div>
      )}
    </li>
  );
}
