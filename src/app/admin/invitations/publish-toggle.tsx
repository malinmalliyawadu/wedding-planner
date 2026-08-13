"use client";

import { Globe, Lock } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import { mintMissingLinks, setPublished } from "./actions";

/**
 * The master switch.
 *
 * While it is off, every invitation link returns a 404 - not a "coming
 * soon" page, nothing at all. That is the point: it starts off, and the
 * only way the outside world sees a single guest's name is if somebody
 * deliberately turns it on.
 */
export function PublishToggle({ published }: { published: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      className={`rounded-lg border p-5 ${
        published
          ? "border-fern/30 bg-fern-tint/50"
          : "border-hairline-strong bg-card"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {published ? (
            <Globe className="mt-0.5 size-5 shrink-0 text-fern" aria-hidden />
          ) : (
            <Lock className="mt-0.5 size-5 shrink-0 text-ink-faint" aria-hidden />
          )}
          <div>
            <p className="font-medium text-ink">
              {published
                ? "The invitation is live"
                : "The invitation is not live"}
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">
              {published
                ? "Anyone holding a link can see it and reply."
                : "Every link returns nothing at all until you turn this on."}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="subtle"
            disabled={pending}
            onClick={() =>
              startTransition(() => {
                void mintMissingLinks();
              })
            }
          >
            Create any missing links
          </Button>
          <Button
            variant={published ? "subtle" : "primary"}
            disabled={pending}
            onClick={() => {
              if (
                !published &&
                !confirm(
                  "Going live means anyone with a link can read the invitation, the schedule and your venue address. Continue?",
                )
              ) {
                return;
              }
              startTransition(() => {
                void setPublished(!published);
              });
            }}
          >
            {published ? "Take it offline" : "Take it live"}
          </Button>
        </div>
      </div>
    </div>
  );
}
