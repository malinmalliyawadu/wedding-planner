"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Asks the server again every few seconds, for the page a guest opens
 * before the booth's upload has landed. `router.refresh()` re-renders
 * the server component in place, so the moment the photograph is there
 * it appears without a reload and without the guest doing anything.
 */
export function Refresh({ everyMs = 4000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
