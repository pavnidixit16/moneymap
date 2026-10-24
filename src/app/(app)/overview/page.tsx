import {
  ArrowDownLeft,
  CalendarClock,
  ChartPie,
  ChevronRight,
  Info,
  Plus,
  Receipt,
  Repeat,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BudgetProgress, CategoryBars } from "@/components/charts";
import { commitmentIconName, IconBubble } from "@/components/icons";
import { Badge, ButtonLink, Card, ErrorNote, SectionTitle, Skeleton } from "@/components/ui";
import {
  getProfile,
  listCommitments,
  listPayments,
  listRecentTransactions,
  listTransactions,
} from "@/lib/data";
import { payCycle } from "@/lib/engine/cycle";
import { istToday, parseISODate } from "@/lib/engine/dates";
import { comingUp, computeOverview, type Overview } from "@/lib/engine/overview";
import { formatDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { categoryLabel } from "@/lib/transactions";

const SHORTCUTS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/spending/new", label: "Add expense", icon: Receipt },
  { href: "/commitments/new", label: "Add bill", icon: Plus },
  { href: "/commitments?tab=upcoming", label: "Upcoming", icon: CalendarClock },
  { href: "/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/spending", label: "Spending", icon: ChartPie },
  { href: "/spending/new?kind=income", label: "Add income", icon: ArrowDownLeft },
  { href: "/commitments/new?type=sip", label: "Add SIP", icon: TrendingUp },
  { href: "/commitments?tab=all", label: "All bills", icon: Wallet },
];

// "PAVNI DIXIT" -> "Pavni"; names already in mixed case are left as typed.
function friendlyFirstName(name: string | null | undefined): string | undefined {
  const first = name?.trim().split(/\s+/)[0];
  if (!first) return undefined;
  return first === first.toUpperCase() || first === first.toLowerCase()
    ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
    : first;
}

function daysBetween(from: string, to: string) {
  const a = parseISODate(from);
  const b = parseISODate(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

function Breakdown({ o }: { o: Overview }) {
  const lines: { label: string; value: number; sign: "+" | "−"; note?: string }[] = [
    {
      label: "Income this pay cycle",
      value: o.incomePaise,
      sign: "+",
      note: o.incomeExtraPaise > 0 ? `Take-home ${formatINR(o.incomeBasePaise)} + extra ${formatINR(o.incomeExtraPaise)}` : "Your take-home pay from Settings",
    },
    { label: "Everyday spending recorded", value: o.spendingPaise, sign: "−" },
    { label: "Bills and EMIs already paid", value: o.obligationsPaidPaise, sign: "−" },
    { label: "Savings and investments already paid", value: o.investmentsPaidPaise, sign: "−" },
    {
      label: "Bills and EMIs still due before payday",
      value: o.obligationsDuePaise,
      sign: "−",
      note: o.overdueCount > 0 ? `Includes ${o.overdueCount} overdue` : undefined,
    },
    { label: "Savings and investments still due before payday", value: o.investmentsDuePaise, sign: "−" },
  ];
  return (
    <details className="group rounded-xl bg-white/10 px-3 py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
        How is this calculated?
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <ul className="flex flex-col gap-2 pt-3">
        {lines.map((l) => (
          <li key={l.label} className="flex justify-between gap-3">
            <span>
              {l.label}
              {l.note && <span className="block text-xs text-white/70">{l.note}</span>}
            </span>
            <span className="shrink-0 tabular-nums">
              {l.sign} {formatINR(l.value)}
            </span>
          </li>
        ))}
        <li className="flex justify-between gap-3 border-t border-white/25 pt-2 font-semibold">
          <span>Estimated amount remaining</span>
          <span className="tabular-nums">{formatINR(o.remainingPaise)}</span>
        </li>
      </ul>
      <p className="pt-3 text-xs text-white/80">
        Not counted: credit-card bills marked reminder-only (their purchases are already in your spending), info-only
        records such as FDs you&apos;ve already made or EPF, and cancelled items.
        {o.includesEstimates && " Some amounts still due are estimates."}
        {o.paidAheadPaise > 0 &&
          ` Already paid includes ${formatINR(o.paidAheadPaise)} paid early for dates after your next payday; a payment counts in the pay cycle you make it.`}
      </p>
    </details>
  );
}

async function Dashboard() {
  await connection();
  let profile, commitments, payments, cycleTransactions, recent;
  let failed = false;
  try {
    profile = await getProfile();
    const cycle = payCycle(profile.payday_day, istToday());
    [commitments, payments, cycleTransactions, recent] = await Promise.all([
      listCommitments(),
      listPayments(),
      listTransactions(cycle.start, cycle.end),
      listRecentTransactions(5),
    ]);
  } catch {
    failed = true;
  }
  if (failed || !profile || !commitments || !payments || !cycleTransactions || !recent) {
    return <ErrorNote>Couldn&apos;t load your dashboard. Please refresh the page; your data is safe.</ErrorNote>;
  }
  if (!profile.onboarded_at) return <Welcome name={profile.display_name} />;

  const today = istToday();
  const o = computeOverview({ profile, transactions: cycleTransactions, commitments, payments, today });
  const daysToPayday = daysBetween(today, o.cycle.nextPayday);
  const due = o.dueItems.slice(0, 5);
  const events = comingUp(commitments, payments, today);
  const unreviewed = commitments.filter((c) => c.kind === "subscription" && c.status === "active" && c.review_status === "unreviewed").length;
  const firstName = friendlyFirstName(profile.display_name);

  return (
    <>
      <section className="flex flex-col gap-3 rounded-3xl bg-gradient-to-br from-hero-from to-hero-to p-5 text-white shadow-lg">
        <div className="flex items-center justify-between text-sm text-white/85">
          <span>{firstName ? `Hi, ${firstName}` : "Hi there"}</span>
          <span>
            {formatDate(o.cycle.start, false)} – {formatDate(o.cycle.end, false)}
          </span>
        </div>
        <div>
          <p className="text-sm text-white/85">Estimated amount remaining after recorded spending and commitments</p>
          <p className="pt-1 text-4xl font-bold tracking-tight tabular-nums" data-testid="estimate">
            {formatINR(o.remainingPaise)}
          </p>
          <p className="pt-1 text-sm text-white/85">
            Until payday on {formatDate(o.cycle.nextPayday, false)} · {daysToPayday} day{daysToPayday === 1 ? "" : "s"} to go
          </p>
        </div>
        <p className="flex gap-2 rounded-xl bg-white/10 p-2 text-xs text-white/90">
          <Info className="size-4 shrink-0" aria-hidden />
          An estimate based only on what you&apos;ve recorded in MoneyMap. It is not your bank balance and excludes your
          opening balance, earlier savings and investment returns.
        </p>
        <Breakdown o={o} />
      </section>

      <Link href="/afford" className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-sm">
        <IconBubble name="wallet" />
        <span className="flex flex-col">
          <span className="font-semibold">Can I afford this?</span>
          <span className="text-muted">Try a purchase against your plan before you buy. Nothing is saved.</span>
        </span>
        <ChevronRight className="ml-auto size-4 shrink-0 text-muted" aria-hidden />
      </Link>

      {o.overdueCount > 0 && (
        <Link href="/commitments?tab=upcoming" className="flex items-center gap-3 rounded-2xl border border-danger/40 bg-surface p-3 text-sm">
          <TriangleAlert className="size-5 shrink-0 text-danger" aria-hidden />
          <span className="flex-1">
            <span className="font-semibold text-danger">{o.overdueCount} overdue</span> ({formatINR(o.overduePaise)}). Mark them
            paid, skip or catch up.
          </span>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
      )}

      <Card>
        <ul className="grid grid-cols-4 gap-y-4">
          {SHORTCUTS.map(({ href, label, icon: ShortcutIcon }) => (
            <li key={href}>
              <Link href={href} className="flex flex-col items-center gap-1.5 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <ShortcutIcon className="size-5" aria-hidden strokeWidth={1.9} />
                </span>
                <span className="text-xs leading-tight font-medium">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionTitle action={<Link href="/spending" className="text-xs font-semibold text-accent">Details</Link>}>
          Spending budget this cycle
        </SectionTitle>
        <BudgetProgress spent={o.spendingPaise} budget={o.budgetPaise} />
        {o.commitmentsExceedBudget && o.budgetLeftPaise > 0 && (
          <p className="flex gap-2 rounded-xl bg-surface-2 p-2 text-xs">
            <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
            Your commitments leave less than your remaining budget. The estimate above is the safer number to plan with.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
          <div>
            <p className="text-xs text-muted">Income this cycle</p>
            <p className="font-semibold tabular-nums">{formatINR(o.incomePaise)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Planned savings and investments</p>
            <p className="font-semibold tabular-nums">{formatINR(o.plannedInvestmentsPaise)}</p>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Where your spending went</SectionTitle>
        {o.spendingPaise > 0 ? (
          <div className="pt-2">
            <CategoryBars items={o.spendingByCategory.slice(0, 5)} total={o.spendingPaise} />
          </div>
        ) : (
          <p className="pt-1 text-sm text-muted">
            No everyday spending logged this cycle. That&apos;s optional; your commitments still drive the estimate.
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle action={<Link href="/commitments?tab=upcoming" className="text-xs font-semibold text-accent">See all</Link>}>
          Due before payday
        </SectionTitle>
        {due.length === 0 ? (
          <p className="pt-1 text-sm text-muted">Nothing left to pay before payday.</p>
        ) : (
          <ul className="divide-y divide-border">
            {due.map((i) => (
              <li key={`${i.commitmentId}-${i.date}`}>
                <Link href={`/commitments/${i.commitmentId}`} className="flex items-center gap-3 py-3">
                  <IconBubble name={commitmentIconName(i.kind, i.subtype)} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{i.name}</span>
                    <span className="flex flex-wrap items-center gap-1 text-xs text-muted">
                      {i.state === "overdue" ? <Badge tone="danger">Overdue · {formatDate(i.date, false)}</Badge> : i.state === "due_today" ? <Badge tone="warning">Due today</Badge> : `Due ${formatDate(i.date, false)}`}
                      {i.bucket === "reminder" && <Badge>Reminder only</Badge>}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{i.amountPaise > 0 ? formatINR(i.amountPaise) : "—"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {events.length > 0 && (
        <Card>
          <SectionTitle>Coming up in the next 60 days</SectionTitle>
          <ul className="divide-y divide-border">
            {events.slice(0, 4).map((e) => (
              <li key={`${e.commitmentId}-${e.type}-${e.date}`}>
                <Link href={`/commitments/${e.commitmentId}`} className="flex justify-between gap-3 py-3 text-sm">
                  <span className="font-semibold">{e.name}</span>
                  <span className="text-muted">
                    {e.type === "maturity" ? "Matures" : "Renewal"} {formatDate(e.date, false)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <SectionTitle action={<Link href="/spending" className="text-xs font-semibold text-accent">See all</Link>}>
          Recent transactions
        </SectionTitle>
        {recent.length === 0 ? (
          <p className="pt-1 text-sm text-muted">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((t) => (
              <li key={t.id}>
                <Link href={`/spending/${t.id}`} className="flex justify-between gap-3 py-3 text-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">{categoryLabel(t.category)}</span>
                    <span className="truncate text-xs text-muted">
                      {formatDate(t.occurred_on, false)}
                      {t.note ? ` · ${t.note}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 font-semibold tabular-nums ${t.kind === "income" ? "text-success" : ""}`}>
                    {t.kind === "income" ? "+" : "−"}
                    {formatINR(t.amount_paise)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {unreviewed > 0 && (
        <Link href="/subscriptions" className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-sm">
          <IconBubble name="repeat" />
          <span className="flex-1">
            <span className="font-semibold">
              {unreviewed} subscription{unreviewed === 1 ? "" : "s"} to review
            </span>
            <span className="block text-xs text-muted">See what each costs per year and decide what to keep.</span>
          </span>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
      )}
    </>
  );
}

function Welcome({ name }: { name: string | null }) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-gradient-to-br from-hero-from to-hero-to p-5 text-white shadow-lg">
      <p className="text-2xl font-bold">Welcome{name ? `, ${friendlyFirstName(name)}` : ""}</p>
      <p className="text-sm text-white/90">
        See what&apos;s already committed, what&apos;s due next and roughly how much remains until payday. Start with your
        take-home pay, payday and spending budget. It takes under a minute.
      </p>
      <div>
        <Link href="/settings" className="inline-flex h-11 items-center rounded-full bg-white px-5 font-semibold text-hero-from">
          Set up MoneyMap
        </Link>
      </div>
    </section>
  );
}

export default function OverviewPage() {
  return (
    <>
      <header className="flex items-center justify-between">
        <p className="text-xl font-bold tracking-tight text-accent">MoneyMap</p>
        <ButtonLink href="/spending/smart" variant="soft">
          <Sparkles className="size-4" aria-hidden /> Smart add
        </ButtonLink>
      </header>
      <Suspense
        fallback={
          <>
            <Skeleton className="h-64" />
            <Skeleton className="h-40" />
          </>
        }
      >
        <Dashboard />
      </Suspense>
    </>
  );
}
