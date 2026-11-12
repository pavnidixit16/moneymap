import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { loadGuestDemo } from "@/lib/demo-load";
import { DashboardView } from "../(app)/overview/dashboard-view";

async function DemoDashboard() {
  const d = await loadGuestDemo();
  return (
    <DashboardView
      profile={d.profile}
      commitments={d.commitments}
      payments={d.payments}
      cycleTransactions={d.cycleTransactions}
      recent={d.transactions.slice(0, 5)}
      today={d.today}
      greeting="Your money at a glance"
      demo
    />
  );
}

export default function DemoHomePage() {
  return (
    <>
      <header className="flex items-center justify-between">
        <p className="text-xl font-bold tracking-tight text-accent">MoneyMap</p>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">Demo</span>
      </header>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <DemoDashboard />
      </Suspense>
    </>
  );
}
