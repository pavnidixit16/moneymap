import { Suspense } from "react";
import { MessageSquareHeart } from "lucide-react";
import Link from "next/link";
import { ButtonLink, Card, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import { getProfile, isAdmin, listCommitments } from "@/lib/data";
import { paiseToInput } from "@/lib/money";
import { SampleDataControls } from "./sample-data";
import { SettingsForm } from "./settings-form";

async function AdminLink() {
  const admin = await isAdmin().catch(() => false);
  if (!admin) return null;
  return (
    <Link href="/settings/feedback/results" className="text-sm font-semibold text-accent underline">
      See what testers said (admins only)
    </Link>
  );
}

async function SampleSection() {
  let loaded = false;
  try {
    loaded = (await listCommitments()).some((c) => c.is_sample);
  } catch {
    return null;
  }
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-semibold">Sample data</h2>
      <SampleDataControls loaded={loaded} />
    </Card>
  );
}

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
          <p className="font-semibold">Welcome to MoneyMap</p>
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
      <PageHeader title="Settings" subtitle="Pay, payday and budget" />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <SettingsContent />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-28" />}>
        <SampleSection />
      </Suspense>
      <Card className="flex flex-col gap-2">
        <h2 className="font-semibold">Share feedback</h2>
        <p className="text-sm text-muted">Five quick questions about your experience. Only the MoneyMap team sees your answers.</p>
        <ButtonLink href="/settings/feedback" variant="soft">
          <MessageSquareHeart className="size-4" aria-hidden /> Share feedback
        </ButtonLink>
        <Suspense fallback={null}>
          <AdminLink />
        </Suspense>
      </Card>
      <Card className="flex flex-col gap-2 text-sm text-muted">
        <p>Amounts are in Indian rupees. Dates follow Indian time.</p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="font-semibold text-accent underline">
            Sign out
          </button>
        </form>
      </Card>
    </>
  );
}
