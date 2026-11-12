import { ChevronRight, Plus, Repeat } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink, ErrorNote, PageHeader, Skeleton, SuccessNote } from "@/components/ui";
import { getProfile, listCommitments, listPayments, type CommitmentRow } from "@/lib/data";
import { istToday } from "@/lib/engine/dates";
import { AllView, UpcomingView } from "./views";

async function AllTab() {
  let commitments: CommitmentRow[];
  try {
    commitments = await listCommitments();
  } catch {
    return <ErrorNote>Couldn&apos;t load your commitments. Please refresh the page.</ErrorNote>;
  }
  return <AllView commitments={commitments} />;
}

async function UpcomingTab() {
  let commitments: CommitmentRow[], payments, profile;
  try {
    [commitments, payments, profile] = await Promise.all([listCommitments(), listPayments(), getProfile()]);
  } catch {
    return <ErrorNote>Couldn&apos;t load your upcoming payments. Please refresh the page.</ErrorNote>;
  }
  return <UpcomingView commitments={commitments} payments={payments} today={istToday()} paydayDay={profile.payday_day} />;
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
