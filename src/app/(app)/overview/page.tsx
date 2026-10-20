import { Suspense } from "react";
import { ButtonLink, Card, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import { getProfile, listCommitments } from "@/lib/data";
import { formatINR } from "@/lib/money";

// Milestone 2: first-run setup prompt and a short status. The full overview with the
// estimate and its breakdown arrives in milestone 4.
async function OverviewContent() {
  let profile, commitments;
  try {
    [profile, commitments] = await Promise.all([getProfile(), listCommitments()]);
  } catch {
    return <ErrorNote>Couldn&apos;t load your overview. Please refresh the page.</ErrorNote>;
  }

  if (!profile.onboarded_at) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-lg font-medium">Welcome{profile.display_name ? `, ${profile.display_name}` : ""}</p>
        <p className="text-sm text-muted">
          Start with your take-home pay, payday and spending budget. It takes under a minute.
        </p>
        <div>
          <ButtonLink href="/settings">Set up MoneyMap</ButtonLink>
        </div>
      </Card>
    );
  }

  const active = commitments.filter((c) => c.status === "active").length;
  return (
    <Card className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        Take-home pay {formatINR(profile.monthly_income_paise)} · payday day {profile.payday_day} · budget{" "}
        {formatINR(profile.cycle_budget_paise)} per pay cycle
      </p>
      <p>
        You have {active} active commitment{active === 1 ? "" : "s"}.
      </p>
      <p className="text-sm text-muted">
        Your estimated amount remaining until payday, with its full breakdown, appears here in the next update.
      </p>
      <div>
        <ButtonLink href="/commitments">View commitments</ButtonLink>
      </div>
    </Card>
  );
}

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" />
      <Suspense fallback={<Skeleton className="h-40" />}>
        <OverviewContent />
      </Suspense>
    </>
  );
}
