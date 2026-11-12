// The Spending page's display, shared by signed-in users and the guest demo. In the demo
// only the current cycle is shown and entries have no detail pages (they need an account).
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BudgetProgress, CategoryBars } from "@/components/charts";
import { Card, SectionTitle } from "@/components/ui";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/capture/types";
import type { ProfileRow, TransactionRow } from "@/lib/data";
import type { PayCycle } from "@/lib/engine/cycle";
import { addDays, type ISODate } from "@/lib/engine/dates";
import { formatDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { categoryLabel } from "@/lib/transactions";

function MaybeLink({ href, className, children }: { href: string | null; className: string; children: ReactNode }) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

export function SpendingView({
  profile,
  transactions,
  cycle,
  today,
  demo = false,
}: {
  profile: Pick<ProfileRow, "cycle_budget_paise">;
  transactions: TransactionRow[];
  cycle: PayCycle;
  today: ISODate;
  demo?: boolean;
}) {
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
        {demo ? (
          <span className="size-9" />
        ) : (
          <Link href={`/spending?on=${previous}`} aria-label="← Previous" className="flex size-9 items-center justify-center rounded-full text-accent">
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
        )}
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
                    <MaybeLink href={demo ? null : `/spending/${t.id}`} className="flex items-center gap-3 py-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">{categoryLabel(t.category)}</span>
                        {(t.note || t.is_sample || t.payment_method) && (
                          <span className="truncate text-xs text-muted">
                            {[t.is_sample ? "Sample" : null, t.payment_method ? PAYMENT_METHOD_LABELS[t.payment_method as PaymentMethod] : null, t.note]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                      <span className={`shrink-0 font-semibold tabular-nums ${t.kind === "income" ? "text-success" : ""}`}>
                        {t.kind === "income" ? "+" : "−"}
                        {formatINR(t.amount_paise)}
                      </span>
                    </MaybeLink>
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

