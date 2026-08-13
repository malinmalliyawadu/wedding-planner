"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { setTaskDone } from "./actions";

export function TaskToggle({
  id,
  done,
  title,
}: {
  id: number;
  done: boolean;
  title: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      role="switch"
      aria-checked={done}
      aria-label={done ? `Mark "${title}" not done` : `Mark "${title}" done`}
      title={done ? "Mark not done" : "Mark done"}
      disabled={pending}
      onClick={() => startTransition(async () => setTaskDone(id, !done))}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150 disabled:opacity-50 ${
        done
          ? "border-fern bg-fern text-white"
          : "border-hairline-strong text-transparent hover:border-fern hover:text-fern/40"
      }`}
    >
      <Check size={12} strokeWidth={3} aria-hidden />
    </button>
  );
}
