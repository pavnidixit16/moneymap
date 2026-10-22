import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { commitmentIconName, IconBubble } from "@/components/icons";
import { Badge, ButtonLink, Card, ErrorNote, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { subtypeLabel } from "@/lib/commitments";
import { listCommitments, type CommitmentRow } from "@/lib/data";
import { subscriptionCosts } from "@/lib/engine/overview";
import { formatDate, frequencyLabel } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { ReviewButtons } from "./review-buttons";

function Row({ c, sameTypeCount }: { c: CommitmentRow; sameTypeCount: number }) {
  const { monthlyPaise, yearlyPaise } = subscriptionCosts(c);
  const cancelled = c.status === "cancelled";
  const priceUp = c.previous_amount_paise !== null && c.previous_amount_paise < c.amount_paise;
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <IconBubble name={commitmentIconName(c.kind, c.subtype)} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={`/commitments/${c.id}`} className="truncate font-semibold">
            {c.name}
          </Link>
          <span className="text-xs text-muted">
            {formatINR(c.amount_paise)} {frequencyLabel(c.frequency).toLowerCase()}
            {!cancelled && c.next_due_date && ` · next ${formatDate(c.next_due_date, false)}`}
          </span>
          <span className="flex flex-wrap gap-1">
            {priceUp && (
              <Badge tone="warning">
                Price up from {formatINR(c.previous_amount_paise!)}
                {c.amount_changed_on ? ` on ${formatDate(c.amount_changed_on, false)}` : ""}
              </Badge>
            )}
            {!cancelled && sameTypeCount > 1 && (
              <Badge>
                {sameTypeCount} {subtypeLabel(c.kind, c.subtype).toLowerCase()} subscriptions
              </Badge>
            )}
            {c.review_status === "unreviewed" && !cancelled && <Badge tone="accent">Not reviewed yet</Badge>}
            {c.is_sample && <Badge>Sample</Badge>}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold tabular-nums">{formatINR(yearlyPaise)}</span>
          <span className="block text-xs text-muted">per year · {formatINR(monthlyPaise)}/mo</span>
        </span>
      </div>
      <ReviewButtons id={c.id} name={c.name} current={cancelled ? "cancelled" : c.review_status} />
      {cancelled && (
        <p className="pt-1 text-xs text-muted">
          Marked as cancelled in MoneyMap, so it&apos;s no longer counted. This doesn&apos;t cancel it with the provider.
        </p>
      )}
    </li>
  );
}

async function SubscriptionsContent() {
  let commitments: CommitmentRow[];
  try {
    commitments = await listCommitments();
  } catch {
    return <ErrorNote>Couldn&apos;t load your subscriptions. Please refresh the page.</ErrorNote>;
  }
  const subs = commitments.filter((c) => c.kind === "subscription" && c.status !== "ended" && c.frequency !== "one_time");
  const active = subs.filter((c) => c.status === "active");
  const cancelled = subs.filter((c) => c.status === "cancelled");

  if (subs.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="font-semibold">No subscriptions yet</p>
        <p className="text-sm text-muted">
          Add streaming, music, apps or gym memberships to see what they cost per month and per year, and decide which to
          keep.
        </p>
        <div>
          <ButtonLink href="/commitments/new?type=subscription">
            <Plus className="size-4" aria-hidden /> Add subscription
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const totals = active.reduce(
    (acc, c) => {
      const { monthlyPaise, yearlyPaise } = subscriptionCosts(c);
      return { monthly: acc.monthly + monthlyPaise, yearly: acc.yearly + yearlyPaise };
    },
    { monthly: 0, yearly: 0 },
  );
  const bySubtype = new Map<string, number>();
  for (const c of active) bySubtype.set(c.subtype, (bySubtype.get(c.subtype) ?? 0) + 1);
  const toReview = active.filter((c) => c.review_status !== "keep").length;

  return (
    <>
      <section className="grid grid-cols-2 gap-3 rounded-3xl bg-gradient-to-br from-hero-from to-hero-to p-5 text-white shadow-lg">
        <div>
          <p className="text-xs text-white/80">Per month</p>
          <p className="text-2xl font-bold tabular-nums" data-testid="subs-monthly">{formatINR(totals.monthly)}</p>
        </div>
        <div>
          <p className="text-xs text-white/80">Per year</p>
          <p className="text-2xl font-bold tabular-nums" data-testid="subs-yearly">{formatINR(totals.yearly)}</p>
        </div>
        <p className="col-span-2 text-xs text-white/85">
          {active.length} active subscription{active.length === 1 ? "" : "s"}
          {toReview > 0 ? ` · ${toReview} not marked Keep yet` : ""}. Yearly cost is the amount × charges per year.
        </p>
      </section>

      {active.length > 0 && (
        <Card>
          <SectionTitle>Active</SectionTitle>
          <ul className="divide-y divide-border">
            {active.map((c) => (
              <Row key={c.id} c={c} sameTypeCount={c.subtype === "other" ? 1 : (bySubtype.get(c.subtype) ?? 1)} />
            ))}
          </ul>
        </Card>
      )}

      {cancelled.length > 0 && (
        <Card>
          <SectionTitle>Cancelled ({cancelled.length})</SectionTitle>
          <ul className="divide-y divide-border">
            {cancelled.map((c) => (
              <Row key={c.id} c={c} sameTypeCount={1} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export default function SubscriptionsPage() {
  return (
    <>
      <PageHeader
        title="Subscriptions"
        subtitle="What recurring services cost you"
        action={
          <ButtonLink href="/commitments/new?type=subscription">
            <Plus className="size-4" aria-hidden /> Add
          </ButtonLink>
        }
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <SubscriptionsContent />
      </Suspense>
    </>
  );
}
