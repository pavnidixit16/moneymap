import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { loadGuestDemo } from "@/lib/demo-load";
import { AllView, UpcomingView } from "../../(app)/commitments/views";

async function DemoCommitments({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const [{ tab }, d] = await Promise.all([searchParams, loadGuestDemo()]);
  const active = tab === "all" ? "all" : "upcoming";
  return (
    <>
      <nav aria-label="Commitment views" className="flex gap-1 rounded-full border border-border bg-surface p-1">
        {[
          { key: "upcoming", label: "Upcoming" },
          { key: "all", label: "All" },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/demo/commitments?tab=${t.key}`}
            aria-current={active === t.key ? "page" : undefined}
            className={`flex-1 rounded-full py-2 text-center text-sm font-semibold ${active === t.key ? "bg-accent text-accent-foreground" : "text-muted"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {active === "all" ? (
        <AllView commitments={d.commitments} demo />
      ) : (
        <UpcomingView commitments={d.commitments} payments={d.payments} today={d.today} paydayDay={d.profile.payday_day} demo />
      )}
    </>
  );
}

export default function DemoCommitmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  return (
    <>
      <PageHeader title="Commitments" subtitle="What's already committed and what's due next" />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <DemoCommitments searchParams={searchParams} />
      </Suspense>
    </>
  );
}
