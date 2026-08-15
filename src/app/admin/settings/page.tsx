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

      <div className="max-w-2xl rounded-lg border border-hairline bg-card p-6 shadow-card">
        <SettingsForm settings={settings} />
      </div>
    </>
  );
}
