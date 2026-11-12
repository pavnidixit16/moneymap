import { connection } from "next/server";
import { Suspense } from "react";
import { Plus, Sparkles } from "lucide-react";
import { ButtonLink, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import { getProfile, listTransactions, type TransactionRow } from "@/lib/data";
import { SpendingView } from "./spending-view";
import { payCycle } from "@/lib/engine/cycle";
import { isISODate, istToday } from "@/lib/engine/dates";

async function SpendingContent({ searchParams }: { searchParams: PageProps<"/spending">["searchParams"] }) {
  await connection();
  const { on } = await searchParams;
  const today = istToday();
  let profile, transactions: TransactionRow[];
  let cycle;
  try {
    profile = await getProfile();
    cycle = payCycle(profile.payday_day, typeof on === "string" && isISODate(on) ? on : today);
    transactions = await listTransactions(cycle.start, cycle.end);
  } catch {
    return <ErrorNote>Couldn&apos;t load your spending. Please refresh the page.</ErrorNote>;
  }

  return <SpendingView profile={profile} transactions={transactions} cycle={cycle} today={today} />;
}

export default function SpendingPage({ searchParams }: PageProps<"/spending">) {
  return (
    <>
      <PageHeader
        title="Spending"
        subtitle="Everyday expenses and extra income"
        action={
          <div className="flex gap-2">
            <ButtonLink href="/spending/smart" variant="soft">
              <Sparkles className="size-4" aria-hidden /> Smart add
            </ButtonLink>
            <ButtonLink href="/spending/new">
              <Plus className="size-4" aria-hidden /> Add
            </ButtonLink>
          </div>
        }
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <SpendingContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
