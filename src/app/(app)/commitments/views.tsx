// The Commitments lists' display, shared by signed-in users and the guest demo. Both run
// their records through the same engine (dueItemsUntil, comingUp). In the demo, detail
// pages, adding and marking paid need an account, so they are not offered.
import Link from "next/link";
import type { ReactNode } from "react";
import { commitmentIconName, IconBubble } from "@/components/icons";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { COMMITMENT_TYPES } from "@/lib/catalog";
import { SECTION_ORDER, subtypeLabel } from "@/lib/commitments";
import type { CommitmentRow, PaymentRow } from "@/lib/data";
import { payCycle } from "@/lib/engine/cycle";
import { addDays, type ISODate } from "@/lib/engine/dates";
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

function MaybeLink({ href, className, children }: { href: string | null; className: string; children: ReactNode }) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

function Row({ c, demo }: { c: CommitmentRow; demo: boolean }) {
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
      <MaybeLink href={demo ? null : `/commitments/${c.id}`} className="flex items-start gap-3 py-3">
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
      </MaybeLink>
    </li>
  );
}

export function AllView({ commitments, demo = false }: { commitments: CommitmentRow[]; demo?: boolean }) {
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
        {!demo && <QuickAdd />}
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
                <Row key={c.id} c={c} demo={demo} />
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
              <Row key={c.id} c={c} demo={demo} />
            ))}
          </ul>
        </details>
      )}
      {!demo && <QuickAdd />}
    </>
  );
}

const STATE_TITLES = { overdue: "Overdue", due_today: "Due today", upcoming: "Next 60 days" } as const;

function DueRow({ item, catchUpCount, canSettle, cycleEnd, demo }: { item: DueItem; catchUpCount: number; canSettle: boolean; cycleEnd: string; demo: boolean }) {
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <IconBubble name={commitmentIconName(item.kind, item.subtype)} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {demo ? (
            <span className="truncate font-semibold">{item.name}</span>
          ) : (
            <Link href={`/commitments/${item.commitmentId}`} className="truncate font-semibold">
              {item.name}
            </Link>
          )}
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
      {demo ? null : catchUpCount >= 2 ? (
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

export function UpcomingView({
  commitments,
  payments,
  today,
  paydayDay,
  demo = false,
}: {
  commitments: CommitmentRow[];
  payments: PaymentRow[];
  today: ISODate;
  paydayDay: number;
  demo?: boolean;
}) {
  if (commitments.length === 0) return <AllView commitments={commitments} demo={demo} />;

  const cycleEnd = payCycle(paydayDay, today).end;
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
                  demo={demo}
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
                <MaybeLink href={demo ? null : `/commitments/${m.commitmentId}`} className="font-medium">
                  {m.name}
                </MaybeLink>
                <span className="text-sm text-muted">Matures {formatDate(m.date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
