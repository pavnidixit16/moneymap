import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import { getCommitment, getProfile, listPayments } from "@/lib/data";
import { payCycle } from "@/lib/engine/cycle";
import { addDays, istToday } from "@/lib/engine/dates";
import { projectOccurrences } from "@/lib/engine/schedule";
import { formatINR } from "@/lib/money";
import { CatchUpForm } from "./catch-up-form";

async function CatchUpContent({ params }: { params: PageProps<"/commitments/[id]/catch-up">["params"] }) {
  const { id } = await params;
  let commitment, payments, profile;
  try {
    commitment = await getCommitment(id);
    [payments, profile] = commitment ? await Promise.all([listPayments(id), getProfile()]) : [[], null];
  } catch {
    return <ErrorNote>Couldn&apos;t load this item. Please refresh the page.</ErrorNote>;
  }
  if (!commitment || !profile) notFound();

  const today = istToday();
  const cycleStart = payCycle(profile.payday_day, today).start;
  const missed =
    commitment.status === "active" && commitment.tracking_mode !== "info"
      ? projectOccurrences(commitment, addDays(today, -1), new Set(payments.map((p) => p.due_date)))
      : [];

  if (missed.length === 0) {
    return (
      <Card>
        <p className="font-medium">Nothing to catch up on</p>
        <p className="text-sm text-muted">{commitment.name} has no missed dates.</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="text-sm">
        <p className="font-medium">
          {commitment.name}: {missed.length} missed date{missed.length === 1 ? "" : "s"}
          {commitment.amount_paise > 0 && <span className="font-normal text-muted"> · usually {formatINR(commitment.amount_paise)}</span>}
        </p>
        <p className="text-muted">
          Tell MoneyMap what happened to each one. Nothing is marked paid unless you choose it; dates you leave stay
          overdue and keep counting as still due.
        </p>
      </Card>
      <CatchUpForm
        commitmentId={commitment.id}
        expectedPaise={commitment.amount_paise}
        rows={missed.map((date) => ({ date, allowUnrecorded: date < cycleStart }))}
      />
    </>
  );
}

export default function CatchUpPage({ params }: PageProps<"/commitments/[id]/catch-up">) {
  return (
    <>
      <PageHeader
        title="Catch up"
        action={
          <Link href="/commitments" className="text-sm font-semibold text-accent underline">
            Back
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <CatchUpContent params={params} />
      </Suspense>
    </>
  );
}
