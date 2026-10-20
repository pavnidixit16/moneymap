import { Suspense } from "react";
import { Card, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import { getProfile } from "@/lib/data";
import { paiseToInput } from "@/lib/money";
import { SettingsForm } from "./settings-form";

async function SettingsContent() {
  let profile;
  try {
    profile = await getProfile();
  } catch {
    return <ErrorNote>Couldn&apos;t load your settings. Please refresh the page.</ErrorNote>;
  }
  const firstTime = !profile.onboarded_at;

  return (
    <>
      {firstTime && (
        <Card>
          <p className="font-medium">Welcome to MoneyMap</p>
          <p className="text-sm text-muted">
            Three quick details and you&apos;re ready to add your bills, EMIs and SIPs.
          </p>
        </Card>
      )}
      <SettingsForm
        key={crypto.randomUUID()}
        initial={{
          display_name: profile.display_name ?? "",
          income: firstTime && profile.monthly_income_paise === 0 ? "" : paiseToInput(profile.monthly_income_paise),
          budget: firstTime && profile.cycle_budget_paise === 0 ? "" : paiseToInput(profile.cycle_budget_paise),
          payday_day: profile.payday_day,
          firstTime,
        }}
      />
    </>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <SettingsContent />
      </Suspense>
      <Card className="flex flex-col gap-2 text-sm text-muted">
        <p>Amounts are in Indian rupees. Dates follow Indian time.</p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="font-medium text-accent underline">
            Sign out
          </button>
        </form>
      </Card>
    </>
  );
}
