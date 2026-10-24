import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import { getProfile, listCommitments, listPayments, listTransactions } from "@/lib/data";
import { payCycle } from "@/lib/engine/cycle";
import { istToday } from "@/lib/engine/dates";
import { computeOverview, dueItemsUntil } from "@/lib/engine/overview";
import { AffordCheck } from "./afford-check";

async function Loader() {
  await connection();
  let data;
  try {
    const profile = await getProfile();
    const today = istToday();
    const cycle = payCycle(profile.payday_day, today);
    const [commitments, payments, transactions] = await Promise.all([listCommitments(), listPayments(), listTransactions(cycle.start, cycle.end)]);
    const overview = computeOverview({ profile, transactions, commitments, payments, today });
    // The next pay cycle's due items, for "what if I buy it after payday?".
    const next = payCycle(profile.payday_day, cycle.nextPayday);
    data = {
      input: { overview, hasCommitments: commitments.some((c) => c.status === "active"), onboarded: Boolean(profile.onboarded_at) },
      next: {
        items: dueItemsUntil(commitments, payments, today, next.end),
        end: next.end,
        // Next cycle's dates already paid this cycle: shown so a ₹0 there makes sense.
        paidEarlyPaise: payments
          .filter((p) => p.outcome === "paid" && p.due_date >= cycle.nextPayday && p.due_date <= next.end)
          .reduce((s, p) => s + p.amount_paise, 0),
      },
    };
  } catch {
    return <ErrorNote>Couldn&apos;t load your estimate. Please refresh the page; nothing was changed.</ErrorNote>;
  }
  return <AffordCheck input={data.input} next={data.next} />;
}

export default function AffordPage() {
  return (
    <>
      <PageHeader
        title="Can I afford this?"
        subtitle="Try a purchase against your plan. Nothing is saved."
        action={
          <Link href="/overview" className="text-sm font-semibold text-accent">
            Close
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Loader />
      </Suspense>
    </>
  );
}
