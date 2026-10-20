import Link from "next/link";
import { Suspense } from "react";
import { Badge, ButtonLink, Card, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import { PRESETS, SECTION_ORDER, subtypeLabel } from "@/lib/commitments";
import { listCommitments, type CommitmentRow } from "@/lib/data";
import { formatDate, frequencyLabel } from "@/lib/format";
import { formatINR } from "@/lib/money";

function QuickAdd() {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESETS.map((p) => (
        <Link
          key={p.key}
          href={`/commitments/new?preset=${p.key}`}
          className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm"
        >
          + {p.label}
        </Link>
      ))}
    </div>
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
      <Link href={`/commitments/${c.id}`} className="flex items-start justify-between gap-3 py-3">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium">{c.name}</span>
          <span className="text-xs text-muted">
            {subtypeLabel(c.kind, c.subtype)} · {schedule}
          </span>
          <span className="flex flex-wrap gap-1">
            {c.tracking_mode === "reminder" && <Badge>Reminder only</Badge>}
            {c.tracking_mode === "info" && <Badge>Info only</Badge>}
            {c.amount_is_estimate && <Badge>Estimate</Badge>}
            {c.status === "cancelled" && <Badge tone="danger">Cancelled</Badge>}
            {c.status === "ended" && <Badge>Ended</Badge>}
          </span>
        </span>
        <span className="shrink-0 text-right font-medium">{c.amount_paise > 0 ? formatINR(c.amount_paise) : "—"}</span>
      </Link>
    </li>
  );
}

async function CommitmentList() {
  let commitments: CommitmentRow[];
  try {
    commitments = await listCommitments();
  } catch {
    return <ErrorNote>Couldn&apos;t load your commitments. Please refresh the page.</ErrorNote>;
  }

  if (commitments.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="font-medium">Add what you pay regularly</p>
        <p className="text-sm text-muted">
          Rent, EMIs, card bills, insurance, subscriptions and SIPs. Enter each one once; MoneyMap works out what&apos;s
          due before payday.
        </p>
        <QuickAdd />
      </Card>
    );
  }

  const active = commitments.filter((c) => c.status === "active");
  const inactive = commitments.filter((c) => c.status !== "active");

  return (
    <>
      <QuickAdd />
      {SECTION_ORDER.map((section) => {
        const items = active.filter((c) => section.kinds.includes(c.kind));
        if (items.length === 0) return null;
        return (
          <Card key={section.title}>
            <h2 className="text-sm font-medium text-muted">{section.title}</h2>
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
    </>
  );
}

async function Welcome({ searchParams }: { searchParams: PageProps<"/commitments">["searchParams"] }) {
  const { welcome } = await searchParams;
  if (welcome !== "1") return null;
  return (
    <p role="status" className="rounded-xl border border-accent/40 bg-surface p-3 text-sm">
      Settings saved. Now add your regular payments; the quick-add buttons fill in sensible defaults.
    </p>
  );
}

export default function CommitmentsPage({ searchParams }: PageProps<"/commitments">) {
  return (
    <>
      <PageHeader title="Commitments" action={<ButtonLink href="/commitments/new">Add</ButtonLink>} />
      <Suspense fallback={null}>
        <Welcome searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <CommitmentList />
      </Suspense>
    </>
  );
}
