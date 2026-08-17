import { AppShell } from "@/components/app-shell";
import { Sidebar, SpineBrand } from "@/components/sidebar";
import { requireAdmin } from "@/lib/auth/session";

/**
 * The planner. Everything under this group needs one of you signed in and
 * may then read anything in the database; the public invitation tree does
 * neither and therefore does not live here.
 *
 * `requireAdmin` here is the second lock, not the first - the proxy has
 * already turned away anyone without a session, and would have done so for
 * the route handlers under this tree that render no layout at all. What
 * this adds is a page that cannot render the guest list even if the proxy
 * were ever misconfigured, and it is where the session object comes from.
 */
export default async function PlannerLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();

  return (
    <AppShell spine={<Sidebar />} brand={<SpineBrand />}>
      {children}
    </AppShell>
  );
}
