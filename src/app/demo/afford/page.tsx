import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { loadGuestDemo } from "@/lib/demo-load";
import { payCycle } from "@/lib/engine/cycle";
import { computeOverview, dueItemsUntil } from "@/lib/engine/overview";
import { AffordCheck } from "../../(app)/afford/afford-check";

async function DemoAfford() {
  const d = await loadGuestDemo();
  const overview = computeOverview({ profile: d.profile, transactions: d.cycleTransactions, commitments: d.commitments, payments: d.payments, today: d.today });
  const next = payCycle(d.profile.payday_day, d.cycle.nextPayday);
  return (
    <AffordCheck
      input={{ overview, hasCommitments: true, onboarded: true }}
      next={{ items: dueItemsUntil(d.commitments, d.payments, d.today, next.end), end: next.end, paidEarlyPaise: 0 }}
      demo
    />
  );
}

export default function DemoAffordPage() {
  return (
    <>
      <PageHeader title="Can I afford this?" subtitle="Try a purchase against the sample plan. Nothing is saved." />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <DemoAfford />
      </Suspense>
    </>
  );
}
