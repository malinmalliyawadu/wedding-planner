import type { ComponentPropsWithoutRef, ReactNode } from "react";

const BUTTON_VARIANTS = {
  primary:
    "bg-ink text-paper hover:bg-spine-raised border border-transparent",
  subtle:
    "bg-card text-ink border border-hairline-strong hover:border-ink-faint hover:bg-white",
  ghost: "bg-transparent text-ink-soft hover:text-ink hover:bg-brass-tint/50",
  danger:
    "bg-transparent text-madder border border-transparent hover:bg-madder-tint",
} as const;

const BUTTON_SIZES = {
  md: "px-4 py-2 text-sm",
  sm: "px-2.5 py-1.5 text-xs",
  icon: "p-1.5",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentPropsWithoutRef<"button"> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8">
      <div className="flex items-end justify-between gap-6 pb-4 rule-double">
        <div>
          <p className="eyebrow text-brass">{eyebrow}</p>
          <h1 className="mt-1.5 font-display text-3xl leading-tight">
            {title}
          </h1>
        </div>
        {actions && <div className="flex shrink-0 gap-2 pb-1">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function Chip({
  tone,
  children,
}: {
  tone: "sage" | "rose" | "neutral" | "brass" | "fern" | "madder";
  children: ReactNode;
}) {
  const tones = {
    sage: "bg-sage-tint text-sage",
    rose: "bg-rose-tint text-rose",
    brass: "bg-brass-tint text-brass",
    fern: "bg-fern-tint text-fern",
    madder: "bg-madder-tint text-madder",
    neutral: "bg-transparent text-ink-soft border border-hairline-strong",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Side chip labelled with the partner's name; "both" gets both dots. */
export function SideChip({
  side,
  nameA,
  nameB,
}: {
  side: "a" | "b" | "both";
  nameA: string;
  nameB: string;
}) {
  if (side === "both") {
    return (
      <Chip tone="neutral">
        <span className="h-1.5 w-1.5 rounded-full bg-sage-mid" aria-hidden />
        <span className="-ml-2 h-1.5 w-1.5 rounded-full bg-rose-mid" aria-hidden />
        Both
      </Chip>
    );
  }
  return (
    <Chip tone={side === "a" ? "sage" : "rose"}>
      {side === "a" ? nameA : nameB}
    </Chip>
  );
}

export function RsvpChip({
  status,
}: {
  status: "pending" | "attending" | "declined";
}) {
  if (status === "attending") return <Chip tone="fern">Attending</Chip>;
  if (status === "declined") return <Chip tone="madder">Declined</Chip>;
  return <Chip tone="neutral">Pending</Chip>;
}

const STAGE_LABELS = {
  not_invited: "Not invited",
  save_the_date: "Save the date",
  invited: "Invited",
  confirmed: "Confirmed",
} as const;

export function StageChip({ stage }: { stage: keyof typeof STAGE_LABELS }) {
  const tone =
    stage === "confirmed" ? "fern" : stage === "not_invited" ? "neutral" : "brass";
  return <Chip tone={tone}>{STAGE_LABELS[stage]}</Chip>;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-soft">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

export const inputBaseClass =
  "rounded-md border border-hairline-strong bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brass focus:outline-none";

export const inputClass = `w-full ${inputBaseClass}`;

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-hairline-strong bg-card/60 px-8 py-14 text-center">
      <p className="font-display text-lg text-ink-soft">{title}</p>
      {hint && <p className="mx-auto mt-2 max-w-sm text-sm text-ink-faint">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
