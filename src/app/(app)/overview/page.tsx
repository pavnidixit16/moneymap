import { Sparkles } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ButtonLink, ErrorNote, Skeleton } from "@/components/ui";
import { getProfile, listCommitments, listPayments, listRecentTransactions, listTransactions } from "@/lib/data";
import { payCycle } from "@/lib/engine/cycle";
import { istToday } from "@/lib/engine/dates";
import { formatINR } from "@/lib/money";
import { previewProfile, SAMPLE_PAY, sampleIsStale } from "@/lib/sample-data";
import { DashboardView, friendlyFirstName } from "./dashboard-view";
import { ExploreSampleButton, SampleRefresher } from "./explore-sample";

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
  // Exploring with sample data before setting up: example pay and budget on screen only.
  const sampleLoaded = commitments.some((c) => c.is_sample) || cycleTransactions.some((t) => t.is_sample);
  const { profile: shown, preview } = previewProfile(profile, sampleLoaded);
  // Demo accounts: an out-of-date sample month (bills overdue, spending in an earlier cycle)
  // is reloaded with today's dates before it is shown.
  if (preview && sampleIsStale(commitments, cycleTransactions, istToday())) return <SampleRefresher />;
  if (!shown.onboarded_at) return <Welcome name={profile.display_name} />;

  return (
    <>
      {preview ? <SamplePreviewNote /> : sampleLoaded && <SampleMixedNote />}
      <DashboardView
        profile={shown}
        commitments={commitments}
        payments={payments}
        cycleTransactions={cycleTransactions}
        recent={recent}
        today={istToday()}
        greeting={preview ? "Welcome to your MoneyMap demo" : undefined}
      />
    </>
  );
}

function SamplePreviewNote() {
  return (
    <div role="note" className="flex flex-col gap-2 rounded-2xl border border-accent/30 bg-accent-soft p-3 text-sm">
      <p>
        <strong>You&apos;re exploring with sample data.</strong> Pay ({formatINR(SAMPLE_PAY.monthly_income_paise)}) and
        budget ({formatINR(SAMPLE_PAY.cycle_budget_paise)}) are examples; items are marked Sample.
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/settings" className="font-semibold text-accent underline">
          Set up with my own numbers
        </Link>
        <Link href="/settings" className="font-semibold text-muted underline">
          Clear sample data (Settings)
        </Link>
      </p>
    </div>
  );
}

// Set up with real numbers but sample items still loaded: say so, so sample figures are
// never mistaken for real ones.
function SampleMixedNote() {
  return (
    <div role="note" className="rounded-2xl border border-accent/30 bg-accent-soft p-3 text-sm">
      <strong>Sample items are included in these figures</strong> (marked Sample).{" "}
      <Link href="/settings" className="font-semibold text-accent underline">
        Clear sample data
      </Link>{" "}
      to see only your own.
    </div>
  );
}

const HOW_IT_WORKS = [
  { title: "Your pay and payday", text: "So MoneyMap knows what comes in and when." },
  { title: "Your regular payments", text: "Rent, EMIs, SIPs, cards and subscriptions: what's already committed." },
  { title: "Log spending your way", text: "Type, speak, upload a statement or check Gmail. You confirm every entry." },
];

function Welcome({ name }: { name: string | null }) {
  return (
    <>
      <section className="flex flex-col gap-3 rounded-3xl bg-gradient-to-br from-hero-from to-hero-to p-5 text-white shadow-lg">
        <p className="text-2xl font-bold">Welcome{name ? `, ${friendlyFirstName(name)}` : ""}</p>
        <p className="text-sm text-white/90">
          See what&apos;s already committed, what&apos;s due next and roughly how much remains until payday. Start with your
          take-home pay, payday and spending budget. It takes under a minute.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings" className="inline-flex h-11 items-center rounded-full bg-white px-5 font-semibold text-hero-from">
            Set up MoneyMap
          </Link>
          <ExploreSampleButton />
        </div>
      </section>
      <section aria-labelledby="how-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 id="how-title" className="font-semibold">
          How it works
        </h2>
        <ol className="flex flex-col gap-3">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent" aria-hidden>
                {i + 1}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{step.title}</span>
                <span className="text-sm text-muted">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted">
          Then Home shows the estimated amount remaining until payday. It&apos;s an estimate from what you record, not your bank
          balance. MoneyMap never asks for bank passwords, PINs or OTPs.
        </p>
      </section>
    </>
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
