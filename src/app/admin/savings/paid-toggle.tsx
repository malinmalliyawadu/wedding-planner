"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { setPaymentPaid } from "./actions";

/** Tick a payment off the schedule, or put it back. */
export function PaidToggle({
  id,
  paid,
  label,
}: {
  id: number;
  paid: boolean;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      role="switch"
      aria-checked={paid}
      aria-label={paid ? `Mark ${label} unpaid` : `Mark ${label} paid`}
      title={paid ? "Mark unpaid" : "Mark paid"}
      disabled={pending}
      onClick={() => startTransition(async () => setPaymentPaid(id, !paid))}
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors duration-150 disabled:opacity-50 ${
        paid
          ? "border-fern bg-fern text-white"
          : "border-hairline-strong text-transparent hover:border-fern hover:text-fern/40"
      }`}
    >
      <Check size={12} strokeWidth={3} aria-hidden />
    </button>
  );
}
