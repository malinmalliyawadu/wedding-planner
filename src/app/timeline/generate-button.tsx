"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui";
import { generateFromWeddingDate, type GenerateResult } from "./actions";

/**
 * Fills in the backwards-planned plan. Safe to press again later: only
 * tasks that are not already on the list get added.
 */
export function GenerateButton({ hasTasks }: { hasTasks: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GenerateResult | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant={hasTasks ? "subtle" : "primary"}
        size={hasTasks ? "sm" : "md"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await generateFromWeddingDate());
            router.refresh();
          })
        }
      >
        <CalendarPlus size={hasTasks ? 14 : 15} aria-hidden />
        {pending
          ? "Planning…"
          : hasTasks
            ? "Fill in what's missing"
            : "Build the plan from the wedding date"}
      </Button>

      {result && !pending && (
        <span aria-live="polite" className="text-xs text-ink-soft">
          {result.added === 0 ? (
            <>Nothing to add — every task in the plan is already here.</>
          ) : (
            <>
              Added <span className="figures">{result.added}</span> task
              {result.added === 1 ? "" : "s"}
              {result.skipped > 0 && (
                <>
                  , left your <span className="figures">{result.skipped}</span>{" "}
                  alone
                </>
              )}
              .
            </>
          )}
        </span>
      )}
    </div>
  );
}
