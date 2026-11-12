import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { demoJourneyStart } from "@/lib/demo-data";
import { istToday } from "@/lib/engine/dates";
import { DemoJourney } from "./demo-journey";

async function Journey() {
  await connection(); // the example month is dated from today
  return <DemoJourney start={demoJourneyStart(istToday())} />;
}

export default function DemoPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-xl font-bold tracking-tight text-accent">
          MoneyMap <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold">Demo</span>
        </p>
        <h1 className="text-2xl font-semibold">Add your commitments. See what’s left until payday.</h1>
        <p className="text-sm text-muted">Try it: change the pay, add or remove a commitment, and watch the number update.</p>
      </header>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Journey />
      </Suspense>
    </>
  );
}
