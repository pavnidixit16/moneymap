import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { loadGuestDemo } from "@/lib/demo-load";
import { SpendingView } from "../../(app)/spending/spending-view";

async function DemoSpending() {
  const d = await loadGuestDemo();
  return <SpendingView profile={d.profile} transactions={d.cycleTransactions} cycle={d.cycle} today={d.today} demo />;
}

export default function DemoSpendingPage() {
  return (
    <>
      <PageHeader title="Spending" subtitle="Everyday expenses and extra income" />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <DemoSpending />
      </Suspense>
    </>
  );
}
