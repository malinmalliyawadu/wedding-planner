"use client";

import {
  useActionState,
  useEffect,
  useOptimistic,
  useState,
  useTransition,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Disc3, Download, Lock, QrCode, RefreshCw } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { idleResult, type ActionResult } from "@/lib/action-result";
import { FLOOR_ACCESS, type FloorAccess } from "@/lib/dj-queue";
import {
  addSong,
  importFromReplyCards,
  newShareCode,
  setFloorAccess,
  setOnAir,
  setSkipVotesNeeded,
  skipOrRemove,
} from "./actions";

/**
 * Keeps the page current on the night: the queue moves every time a guest
 * votes or the bridge reports, and this is the screen the two of you
 * glance at between dances.
 */
export function AutoRefresh({ everyMs = 5000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}

const ACCESS: Record<
  FloorAccess,
  { label: string; heading: string; body: string; icon: typeof Lock; tone: string; iconTone: string }
> = {
  closed: {
    label: "Closed",
    heading: "Requests are closed",
    body: "Invitations hide the link, and the QR code says requests open later. The bridge still plays what is already on the list.",
    icon: Lock,
    tone: "border-hairline-strong bg-card",
    iconTone: "text-ink-faint",
  },
  venue: {
    label: "Venue only",
    heading: "Open at the venue",
    body: "The QR code takes requests and votes, even while the invitation site is unpublished. Invitations still hide the link.",
    icon: QrCode,
    tone: "border-brass/30 bg-brass-tint/50",
    iconTone: "text-brass",
  },
  everyone: {
    label: "Everyone",
    heading: "Open to everyone",
    body: "Every invitation shows a “Request a song” link, and guests can add and vote - from it or from the venue QR code.",
    icon: Disc3,
    tone: "border-fern/30 bg-fern-tint/50",
    iconTone: "text-fern",
  },
};

/**
 * Who the floor takes requests from. Three settings rather than a toggle,
 * so the QR code can open on its own: the floor runs for the room, or is
 * tried on a phone, while every invitation link still hides it. A radio
 * group by the APG pattern - arrows move and choose, Tab leaves.
 */
export function AccessSwitch({ access }: { access: FloorAccess }) {
  const [shown, setShown] = useOptimistic(access);
  const [pending, startTransition] = useTransition();
  const current = ACCESS[shown];
  const Icon = current.icon;

  function choose(next: FloorAccess) {
    if (next === shown) return;
    startTransition(async () => {
      setShown(next);
      const result = await setFloorAccess(next);
      if (result.status === "error") alert(result.message);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = FLOOR_ACCESS.indexOf(shown);
    const next = FLOOR_ACCESS[(index + step + FLOOR_ACCESS.length) % FLOOR_ACCESS.length];
    choose(next);
    event.currentTarget.querySelector<HTMLElement>(`[data-access="${next}"]`)?.focus();
  }

  return (
    <div className={`rounded-lg border p-5 transition-colors duration-150 ${current.tone}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 size-5 shrink-0 ${current.iconTone}`} aria-hidden />
          <div>
            <p id="floor-access-heading" className="font-medium text-ink">
              {current.heading}
            </p>
            <p className="mt-0.5 max-w-xl text-sm text-ink-soft">{current.body}</p>
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label="Who can ask for songs"
          aria-describedby="floor-access-heading"
          aria-busy={pending}
          onKeyDown={onKeyDown}
          className="inline-flex shrink-0 self-start rounded-md border border-hairline-strong bg-card p-0.5 sm:self-auto"
        >
          {FLOOR_ACCESS.map((option) => {
            const checked = option === shown;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                data-access={option}
                onClick={() => choose(option)}
                className={`rounded-[5px] px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 pointer-coarse:min-h-11 pointer-coarse:text-sm ${
                  checked ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
                }`}
              >
                {ACCESS[option].label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const RUN = {
  skip: (id: number) => skipOrRemove(id),
  onAir: (id: number) => setOnAir(id),
  nothingOn: () => setOnAir(null),
  importReplies: () => importFromReplyCards(),
} satisfies Record<string, (id: number) => Promise<ActionResult>>;

/**
 * A button that runs one of the page's actions on one song. Named by
 * `kind` rather than handed a function, because the page that renders it
 * is a server component and can only pass data across.
 */
export function ActButton({
  kind,
  itemId = 0,
  variant = "subtle",
  confirmText,
  children,
}: {
  kind: keyof typeof RUN;
  itemId?: number;
  variant?: "primary" | "subtle" | "ghost" | "danger";
  confirmText?: string;
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={pending}
      className="pointer-coarse:min-h-11"
      onClick={() => {
        if (confirmText && !confirm(confirmText)) return;
        startTransition(async () => {
          const result = await RUN[kind](itemId);
          if (result.status === "error") alert(result.message);
        });
      }}
    >
      {children}
    </Button>
  );
}

function InlineForm({
  action,
  submitLabel,
  children,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, idleResult);
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        {children}
        <Button type="submit" variant="subtle" disabled={pending} className="pointer-coarse:min-h-11">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-madder">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function AddSongForm() {
  return (
    <InlineForm action={addSong} submitLabel="Add to the list">
      <Field label="Title">
        <input name="title" required maxLength={200} className={inputClass} />
      </Field>
      <Field label="Artist">
        <input name="artist" maxLength={200} className={inputClass} />
      </Field>
    </InlineForm>
  );
}

export function ThresholdForm({ value }: { value: number }) {
  const [state, formAction, pending] = useActionState(setSkipVotesNeeded, idleResult);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <Field label="Votes to skip" hint="One per invitation link, and one per phone from the QR code.">
        <input
          name="skipVotesNeeded"
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          defaultValue={value}
          key={value}
          className={`${inputClass} figures w-28`}
        />
      </Field>
      <Button type="submit" variant="subtle" disabled={pending} className="pointer-coarse:min-h-11">
        {pending ? "Saving…" : "Save"}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="w-full text-sm text-madder">
          {state.message}
        </p>
      )}
    </form>
  );
}

/**
 * The venue's QR code: the dance floor for anyone at the wedding, with no
 * invitation link needed. The image is made on the server and passed in;
 * the SVG is the one to print, since it stays sharp at any size.
 */
export function ShareCodeCard({
  url,
  svg,
}: {
  url: string | null;
  svg: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function replace() {
    if (
      url &&
      !confirm(
        "Make a new QR code? Every printed copy of the current one stops working straight away.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await newShareCode();
      if (result.status === "error") alert(result.message);
    });
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (!url || !svg) {
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow text-ink-faint">The QR code for the venue</p>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            One code for the tables, the bar or the wall. Anyone who scans it
            can ask for songs and vote without their invitation link; votes
            from it count once per phone.
          </p>
        </div>
        <Button variant="subtle" disabled={pending} onClick={replace} className="shrink-0 pointer-coarse:min-h-11">
          {pending ? "Making…" : "Make the QR code"}
        </Button>
      </div>
    );
  }

  const svgHref = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={svgHref}
        alt="QR code for the dance floor"
        width={160}
        height={160}
        className="size-40 shrink-0 rounded-md border border-hairline bg-white p-2"
      />
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-ink-faint">The QR code for the venue</p>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          Put it on the tables, the bar or the wall. Anyone who scans it can
          ask for songs and vote without their invitation link; votes from it
          count once per phone. It works while requests are open at the venue
          or to everyone, whether or not the invitation site is published.
        </p>
        <p className="mt-3 truncate font-mono text-xs text-ink-faint">{url}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="subtle" onClick={copy} className="pointer-coarse:min-h-11">
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copied ? "Copied" : "Copy the link"}
          </Button>
          <a
            href={svgHref}
            download="dance-floor-qr.svg"
            // Dressed as a subtle small Button: a download has to be a link.
            className="inline-flex items-center justify-center gap-2 rounded-md border border-hairline-strong bg-card px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-ink transition-colors duration-150 hover:border-ink-faint hover:bg-white pointer-coarse:min-h-11"
          >
            <Download size={15} aria-hidden />
            Download to print
          </a>
          <Button size="sm" variant="ghost" disabled={pending} onClick={replace} className="pointer-coarse:min-h-11">
            <RefreshCw size={15} aria-hidden />
            {pending ? "Replacing…" : "Replace the code"}
          </Button>
        </div>
      </div>
    </div>
  );
}
