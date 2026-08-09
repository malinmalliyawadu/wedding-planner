import { EmptyState, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/queries";
import { BudgetModeller } from "./budget-modeller";
import { BudgetItemDialog } from "./budget-item-dialog";
import { BudgetTabs } from "./budget-tabs";
import { countsFromGuestList, loadBudgetItems, loadScenarios } from "./queries";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const [settings, items, scenarios, guestListCounts] = await Promise.all([
    getSettings(),
    loadBudgetItems(),
    loadScenarios(),
    countsFromGuestList(),
  ]);

  return (
    <>
      <PageHeader eyebrow="What it costs" title="Budget">
        <BudgetTabs />
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState
          title="No budget items yet"
          hint="Add what you are paying for. Split each cost into the part that is fixed and the part that scales with the guest count."
          action={<BudgetItemDialog />}
        />
      ) : (
        <BudgetModeller
          items={items}
          scenarios={scenarios}
          guestListCounts={guestListCounts}
          nameA={settings.partnerAName}
          nameB={settings.partnerBName}
        />
      )}
    </>
  );
}
