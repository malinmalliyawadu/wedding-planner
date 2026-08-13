import { AppShell } from "@/components/app-shell";
import { Sidebar, SpineBrand } from "@/components/sidebar";

/**
 * The planner. Everything under this group sits behind Traefik basicauth
 * and may read anything in the database; the public invitation tree does
 * neither and therefore does not live here.
 */
export default function PlannerLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell spine={<Sidebar />} brand={<SpineBrand />}>
      {children}
    </AppShell>
  );
}
