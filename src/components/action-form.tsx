"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import { idleResult, type ActionResult } from "@/lib/action-result";
import { Button } from "./ui";

type FormAction = (
  prev: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

/**
 * Form wired to a server action: shows the first validation error, a
 * pending state on the submit button, and calls onSuccess (used by
 * dialogs to close) when the action completes.
 */
export function ActionForm({
  action,
  onSuccess,
  submitLabel,
  children,
}: {
  action: FormAction;
  onSuccess: () => void;
  submitLabel: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, idleResult);

  useEffect(() => {
    if (state.status === "success") onSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      {children}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-madder">
          {state.message}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
