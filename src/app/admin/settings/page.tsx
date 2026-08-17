import Link from "next/link";
import { ChevronRight, Fingerprint } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/queries";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <>
      <PageHeader eyebrow="The particulars" title="Settings">
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          Your names label every side chip and priority bar in the app. The
          wedding date drives the countdown and the savings projection, and
          the caterer&rsquo;s rate prices the venues that do not feed anyone.
        </p>
      </PageHeader>

      <div className="max-w-2xl space-y-4">
        <div className="rounded-lg border border-hairline bg-card p-6 shadow-card">
          <SettingsForm settings={settings} />
        </div>

        <Link
          href="/admin/access"
          className="group flex items-center gap-4 rounded-lg border border-hairline bg-card px-5 py-4 shadow-card transition-colors duration-150 hover:border-hairline-strong"
        >
          <Fingerprint
            size={18}
            strokeWidth={1.75}
            className="shrink-0 text-ink-faint"
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Access</span>
            <span className="mt-0.5 block text-xs text-ink-faint">
              Passkeys, the app password and where you are signed in
            </span>
          </span>
          <ChevronRight
            size={16}
            strokeWidth={1.75}
            className="shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
    </>
  );
}
