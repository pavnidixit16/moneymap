import { ChevronRight, Plus, Repeat } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { commitmentIconName, IconBubble } from "@/components/icons";
import { Badge, ButtonLink, Card, ErrorNote, PageHeader, SectionTitle, Skeleton, SuccessNote } from "@/components/ui";
import { COMMITMENT_TYPES } from "@/lib/catalog";
import { SECTION_ORDER, subtypeLabel } from "@/lib/commitments";
import { getProfile, listCommitments, listPayments, type CommitmentRow } from "@/lib/data";
import { payCycle } from "@/lib/engine/cycle";
import { addDays, istToday } from "@/lib/engine/dates";
import { comingUp, dueItemsUntil, type DueItem } from "@/lib/engine/overview";
import { formatDate, frequencyLabel } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { SettleControls } from "./settle-controls";

// Shortcut grid: the eight most common types, then "More" opens the full picker.
const QUICK_TYPES = ["rent", "bill", "emi", "card", "insurance", "subscription", "sip", "fd"];

function QuickAdd() {
  return (
    <Card>
      <SectionTitle>Add a commitment</SectionTitle>
      <ul className="grid grid-cols-4 gap-y-3 pt-2">
        {QUICK_TYPES.map((key) => {
          const t = COMMITMENT_TYPES.find((x) => x.key === key)!;
          return (
            <li key={key}>
              <Link href={`/commitments/new?type=${key}`} aria-label={`Add ${t.label}`} className="flex flex-col items-center gap-1.5 text-center">
                <IconBubble name={t.icon} className="size-12" />
                <span className="text-xs leading-tight font-medium">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Row({ c }: { c: CommitmentRow }) {
  const schedule =
    c.tracking_mode === "info"
      ? c.maturity_date
        ? `Matures ${formatDate(c.maturity_date)}`
        : "No payments due"
      : c.next_due_date
        ? `${frequencyLabel(c.frequency)} · next ${formatDate(c.next_due_date)}`
        : frequencyLabel(c.frequency);

  return (
    <li>
      <Link href={`/commitments/${c.id}`} className="flex items-start gap-3 py-3">
        <IconBubble name={commitmentIconName(c.kind, c.subtype)} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-semibold">{c.name}</span>
          <span className="text-xs text-muted">
            {c.provider ? `${c.provider} · ` : `${subtypeLabel(c.kind, c.subtype)} · `}
            {schedule}
          </span>
          <span className="flex flex-wrap gap-1">
            {c.tracking_mode === "reminder" && <Badge>Reminder only</Badge>}
            {c.tracking_mode === "info" && <Badge>Info only</Badge>}
            {c.amount_is_estimate && <Badge>Estimate</Badge>}
            {c.status === "cancelled" && <Badge tone="danger">Cancelled</Badge>}
            {c.status === "ended" && <Badge>Ended</Badge>}
            {c.is_sample && <Badge tone="accent">Sample</Badge>}
          </span>
        </span>
        <span className="shrink-0 text-right font-semibold">{c.amount_paise > 0 ? formatINR(c.amount_paise) : "—"}</span>
      </Link>
    </li>
  );
}

async function AllTab() {
  let commitments: CommitmentRow[];
  try {
    commitments = await listCommitments();
  } catch {
    return <ErrorNote>Couldn&apos;t load your commitments. Please refresh the page.</ErrorNote>;
  }

  if (commitments.length === 0) {
    return (
      <>
        <Card className="flex flex-col gap-1">
          <p className="font-semibold">Add what you pay regularly</p>
          <p className="text-sm text-muted">
            Rent, EMIs, card bills, insurance, subscriptions and SIPs. Enter each one once; MoneyMap works out what&apos;s
            due before payday.
          </p>
        </Card>
        <QuickAdd />
      </>
    );
  }

  const active = commitments.filter((c) => c.status === "active");
  const inactive = commitments.filter((c) => c.status !== "active");

  return (
    <>
      {SECTION_ORDER.map((section) => {
        const items = active.filter((c) => section.kinds.includes(c.kind));
        if (items.length === 0) return null;
        return (
          <Card key={section.title}>
            <SectionTitle>{section.title}</SectionTitle>
            <ul className="divide-y divide-border">
              {items.map((c) => (
                <Row key={c.id} c={c} />
              ))}
            </ul>
          </Card>
        );
      })}
      {inactive.length > 0 && (
        <details className="rounded-xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted">
            Cancelled and ended ({inactive.length})
          </summary>
          <ul className="divide-y divide-border">
            {inactive.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </ul>
        </details>
      )}
      <QuickAdd />
    </>
  );
}


const STATE_TITLES = { overdue: "Overdue", due_today: "Due today", upcoming: "Next 60 days" } as const;

function DueRow({ item, catchUpCount, canSettle, cycleEnd }: { item: DueItem; catchUpCount: number; canSettle: boolean; cycleEnd: string }) {
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <IconBubble name={commitmentIconName(item.kind, item.subtype)} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={`/commitments/${item.commitmentId}`} className="truncate font-semibold">
            {item.name}
          </Link>
          <span className="text-xs text-muted">Due {formatDate(item.date)}</span>
          <span className="flex flex-wrap gap-1">
            {item.state === "overdue" && <Badge tone="danger">Overdue</Badge>}
            {item.bucket === "reminder" && <Badge>Reminder only</Badge>}
            {item.bucket === "investment" && <Badge tone="accent">Investment</Badge>}
            {item.isEstimate && <Badge>Estimate</Badge>}
          </span>
        </span>
        <span className="shrink-0 text-right font-semibold">{item.amountPaise > 0 ? formatINR(item.amountPaise) : "—"}</span>
      </div>
      {catchUpCount >= 2 ? (
        <p className="pt-2 text-sm">
          {catchUpCount} missed dates.{" "}
          <Link href={`/commitments/${item.commitmentId}/catch-up`} className="font-semibold text-accent underline">
            Catch up
          </Link>
        </p>
      ) : canSettle ? (
        <SettleControls
          key={`${item.commitmentId}-${item.date}`}
          commitmentId={item.commitmentId}
          dueDate={item.date}
          expectedPaise={item.amountPaise}
          label={`${item.name} due ${formatDate(item.date)}`}
          afterPayday={item.date > cycleEnd && item.bucket !== "reminder"}
        />
      ) : (
        <p className="pt-1 text-xs text-muted">Settle the earlier date first.</p>
      )}
    </li>
  );
}

async function UpcomingTab() {
  let commitments: CommitmentRow[], payments, profile;
  try {
    [commitments, payments, profile] = await Promise.all([listCommitments(), listPayments(), getProfile()]);
  } catch {
    return <ErrorNote>Couldn&apos;t load your upcoming payments. Please refresh the page.</ErrorNote>;
  }
  if (commitments.length === 0) return <AllTab />;

  const today = istToday();
  const cycleEnd = payCycle(profile.payday_day, today).end;
  const items = dueItemsUntil(commitments, payments, today, addDays(today, 60));
  const maturities = comingUp(commitments, payments, today).filter((e) => e.type === "maturity");
  // Paid / Skip only on each item's earliest open date, so dates are settled in order.
  const earliestByCommitment = new Map<string, string>();
  for (const i of items) if (!earliestByCommitment.has(i.commitmentId)) earliestByCommitment.set(i.commitmentId, i.date);
  const overdueByCommitment = new Map<string, number>();
  for (const i of items) {
    if (i.state === "overdue") overdueByCommitment.set(i.commitmentId, (overdueByCommitment.get(i.commitmentId) ?? 0) + 1);
  }

  if (items.length === 0 && maturities.length === 0) {
    return (
      <Card>
        <p className="font-medium">Nothing due in the next 60 days</p>
        <p className="text-sm text-muted">Payments you add with a due date will appear here.</p>
      </Card>
    );
  }

  return (
    <>
      {(["overdue", "due_today", "upcoming"] as const).map((state) => {
        const group = items.filter((i) => i.state === state);
        if (group.length === 0) return null;
        // A commitment with several missed dates shows one Catch up row, not one per date.
        const shown = group.filter(
          (i, idx) => state !== "overdue" || (overdueByCommitment.get(i.commitmentId) ?? 0) < 2 || group.findIndex((g) => g.commitmentId === i.commitmentId) === idx,
        );
        return (
          <Card key={state}>
            <h2 className={`mb-1 text-sm font-semibold ${state === "overdue" ? "text-danger" : "text-muted"}`}>{STATE_TITLES[state]}</h2>
            <ul className="divide-y divide-border">
              {shown.map((i) => (
                <DueRow
                  key={`${i.commitmentId}-${i.date}`}
                  item={i}
                  catchUpCount={state === "overdue" ? (overdueByCommitment.get(i.commitmentId) ?? 0) : 0}
                  canSettle={earliestByCommitment.get(i.commitmentId) === i.date}
                  cycleEnd={cycleEnd}
                />
              ))}
            </ul>
          </Card>
        );
      })}
      {maturities.length > 0 && (
        <Card>
          <SectionTitle>Maturities coming up</SectionTitle>
          <ul className="divide-y divide-border">
            {maturities.map((m) => (
              <li key={m.commitmentId} className="flex justify-between gap-3 py-3">
                <Link href={`/commitments/${m.commitmentId}`} className="font-medium">
                  {m.name}
                </Link>
                <span className="text-sm text-muted">Matures {formatDate(m.date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

async function Tabs({ searchParams }: { searchParams: PageProps<"/commitments">["searchParams"] }) {
  const { tab } = await searchParams;
  const active = tab === "all" ? "all" : "upcoming";
  const tabs = [
    { key: "upcoming", label: "Upcoming" },
    { key: "all", label: "All" },
  ];
  return (
    <>
      <nav aria-label="Commitment views" className="flex gap-1 rounded-full border border-border bg-surface p-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/commitments?tab=${t.key}`}
            aria-current={active === t.key ? "page" : undefined}
            className={`flex-1 rounded-full py-2 text-center text-sm font-semibold ${active === t.key ? "bg-accent text-accent-foreground" : "text-muted"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {active === "all" ? <AllTab /> : <UpcomingTab />}
    </>
  );
}

async function Welcome({ searchParams }: { searchParams: PageProps<"/commitments">["searchParams"] }) {
  const { welcome, caughtup } = await searchParams;
  if (typeof caughtup === "string") {
    return <SuccessNote>Caught up: {caughtup} date{caughtup === "1" ? "" : "s"} recorded.</SuccessNote>;
  }
  if (welcome !== "1") return null;
  return <SuccessNote>Settings saved. Now add your regular payments; each type fills in sensible defaults.</SuccessNote>;
}

export default function CommitmentsPage({ searchParams }: PageProps<"/commitments">) {
  return (
    <>
      <PageHeader
        title="Commitments"
        subtitle="What's already committed and what's due next"
        action={
          <ButtonLink href="/commitments/new">
            <Plus className="size-4" aria-hidden /> Add
          </ButtonLink>
        }
      />
      <Link href="/subscriptions" className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-sm font-semibold">
        <Repeat className="size-5 text-accent" aria-hidden /> Subscriptions: what they cost each month and year
        <ChevronRight className="ml-auto size-4 text-muted" aria-hidden />
      </Link>
      <Suspense fallback={null}>
        <Welcome searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Tabs searchParams={searchParams} />
      </Suspense>
    </>
  );
}
