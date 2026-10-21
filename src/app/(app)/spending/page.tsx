import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ButtonLink, Card, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
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

  const byDate = new Map<string, TransactionRow[]>();
  for (const t of transactions) byDate.set(t.occurred_on, [...(byDate.get(t.occurred_on) ?? []), t]);

  return (
    <>
      <nav aria-label="Pay cycle" className="flex items-center justify-between gap-2 text-sm">
        <Link href={`/spending?on=${previous}`} className="font-medium text-accent underline">
          ← Previous
        </Link>
        <span className="text-center font-medium">
          {formatDate(cycle.start, false)} – {formatDate(cycle.end)}
          {isCurrent && <span className="block text-xs font-normal text-muted">This pay cycle</span>}
        </span>
        {isCurrent ? (
          <span className="w-16" />
        ) : (
          <Link href={`/spending?on=${next}`} className="font-medium text-accent underline">
            Next →
          </Link>
        )}
      </nav>

      <Card className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted">Spent this cycle</p>
          <p className="text-xl font-semibold">{formatINR(spent)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Budget left</p>
          <p className={`text-xl font-semibold ${left < 0 ? "text-danger" : ""}`}>
            {left < 0 ? `Over by ${formatINR(-left)}` : formatINR(left)}
          </p>
          <p className="text-xs text-muted">of {formatINR(profile.cycle_budget_paise)}</p>
        </div>
        {extraIncome > 0 && <p className="col-span-2 text-xs text-muted">Extra income this cycle: {formatINR(extraIncome)}</p>}
      </Card>

      {transactions.length === 0 ? (
        <Card>
          <p className="font-medium">No spending logged {isCurrent ? "this cycle" : "in this cycle"}</p>
          <p className="text-sm text-muted">
            That&apos;s fine. Logging everyday spending is optional; your commitments still drive the estimate.
          </p>
        </Card>
      ) : (
        [...byDate].map(([date, items]) => (
          <Card key={date}>
            <h2 className="text-sm font-medium text-muted">{formatDate(date)}</h2>
            <ul className="divide-y divide-border">
              {items.map((t) => (
                <li key={t.id}>
                  <Link href={`/spending/${t.id}`} className="flex justify-between gap-3 py-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{categoryLabel(t.category)}</span>
                      {t.note && <span className="truncate text-xs text-muted">{t.note}</span>}
                    </span>
                    <span className={`shrink-0 font-medium ${t.kind === "income" ? "text-accent" : ""}`}>
                      {t.kind === "income" ? "+" : ""}
                      {formatINR(t.amount_paise)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </>
  );
}

export default function SpendingPage({ searchParams }: PageProps<"/spending">) {
  return (
    <>
      <PageHeader title="Spending" action={<ButtonLink href="/spending/new">Add</ButtonLink>} />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <SpendingContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
