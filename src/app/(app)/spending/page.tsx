import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { BudgetProgress, CategoryBars } from "@/components/charts";
import { ButtonLink, Card, ErrorNote, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { getProfile, listTransactions, type TransactionRow } from "@/lib/data";
import { payCycle } from "@/lib/engine/cycle";
import { addDays, isISODate, istToday } from "@/lib/engine/dates";
import { formatDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { categoryLabel } from "@/lib/transactions";

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

  const isCurrent = cycle.start <= today && today <= cycle.end;
  const previous = addDays(cycle.start, -1);
  const next = addDays(cycle.end, 1);
  const spent = transactions.filter((t) => t.kind === "expense").reduce((sum, t) => sum + t.amount_paise, 0);
  const extraIncome = transactions.filter((t) => t.kind === "income").reduce((sum, t) => sum + t.amount_paise, 0);
  const left = profile.cycle_budget_paise - spent;

  const categoryTotals = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind === "expense") categoryTotals.set(t.category, (categoryTotals.get(t.category) ?? 0) + t.amount_paise);
  }
  const byCategory = [...categoryTotals].map(([category, paise]) => ({ category, paise })).sort((a, b) => b.paise - a.paise);

  const byDate = new Map<string, TransactionRow[]>();
  for (const t of transactions) byDate.set(t.occurred_on, [...(byDate.get(t.occurred_on) ?? []), t]);

  return (
    <>
      <nav aria-label="Pay cycle" className="flex items-center justify-between gap-2 rounded-full border border-border bg-surface p-1 text-sm">
        <Link href={`/spending?on=${previous}`} aria-label="← Previous" className="flex size-9 items-center justify-center rounded-full text-accent">
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <span className="text-center font-medium">
          {formatDate(cycle.start, false)} – {formatDate(cycle.end)}
          {isCurrent && <span className="block text-xs font-normal text-muted">This pay cycle</span>}
        </span>
        {isCurrent ? (
          <span className="size-9" />
        ) : (
          <Link href={`/spending?on=${next}`} aria-label="Next →" className="flex size-9 items-center justify-center rounded-full text-accent">
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        )}
      </nav>

      <Card className="flex flex-col gap-3">
        <SectionTitle>Spending budget</SectionTitle>
        <BudgetProgress spent={spent} budget={profile.cycle_budget_paise} />
        {profile.cycle_budget_paise > 0 && (
          <p className="sr-only">
            Budget left: {left < 0 ? `Over by ${formatINR(-left)}` : formatINR(left)}
          </p>
        )}
        {extraIncome > 0 && <p className="text-xs text-muted">Extra income this cycle: {formatINR(extraIncome)}</p>}
      </Card>

      {spent > 0 && (
        <Card>
          <SectionTitle>By category</SectionTitle>
          <div className="pt-2">
            <CategoryBars items={byCategory} total={spent} />
          </div>
        </Card>
      )}

      {transactions.length === 0 ? (
        <Card>
          <p className="font-semibold">No spending logged {isCurrent ? "this cycle" : "in this cycle"}</p>
          <p className="text-sm text-muted">
            That&apos;s fine. Logging everyday spending is optional; your commitments still drive the estimate.
          </p>
        </Card>
      ) : (
        <Card>
          <SectionTitle>Transactions</SectionTitle>
          {[...byDate].map(([date, items]) => (
            <section key={date} className="pt-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{formatDate(date)}</h3>
              <ul className="divide-y divide-border">
                {items.map((t) => (
                  <li key={t.id}>
                    <Link href={`/spending/${t.id}`} className="flex items-center gap-3 py-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">{categoryLabel(t.category)}</span>
                        {(t.note || t.is_sample) && (
                          <span className="truncate text-xs text-muted">
                            {t.is_sample ? "Sample" : ""}
                            {t.is_sample && t.note ? " · " : ""}
                            {t.note}
                          </span>
                        )}
                      </span>
                      <span className={`shrink-0 font-semibold tabular-nums ${t.kind === "income" ? "text-success" : ""}`}>
                        {t.kind === "income" ? "+" : "−"}
                        {formatINR(t.amount_paise)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </Card>
      )}
    </>
  );
}

export default function SpendingPage({ searchParams }: PageProps<"/spending">) {
  return (
    <>
      <PageHeader
        title="Spending"
        subtitle="Everyday expenses and extra income"
        action={
          <ButtonLink href="/spending/new">
            <Plus className="size-4" aria-hidden /> Add
          </ButtonLink>
        }
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <SpendingContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
