import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getVerifiedUserId } from "@/lib/supabase/server";

// Milestone 1 placeholder: proves sign-in, the profile trigger and row-level security
// work end to end. The real overview arrives in milestone 4.
async function ProfileCard() {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/login?next=/overview");

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, payday_day")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-border bg-surface p-4 text-danger">
        Couldn&apos;t load your profile. Please refresh the page.
      </p>
    );
  }
  if (!profile) {
    return (
      <p role="alert" className="rounded-xl border border-border bg-surface p-4 text-danger">
        Your profile is missing. Sign out and sign in again; if it persists, the database
        migration has not been applied.
      </p>
    );
  }
  return (
    <section className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4">
      <p className="text-lg">
        Signed in{profile.display_name ? ` as ${profile.display_name}` : ""}.
      </p>
      <p className="text-sm text-muted">
        Your profile was created and is visible only to you. Payday is set to day{" "}
        {profile.payday_day}.
      </p>
    </section>
  );
}

export default function OverviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm font-medium text-accent underline">
            Sign out
          </button>
        </form>
      </header>

      <Suspense
        fallback={<div className="h-20 animate-pulse rounded-xl bg-border" aria-label="Loading" />}
      >
        <ProfileCard />
      </Suspense>

      <p className="text-sm text-muted">
        Milestone 1: sign-in and secure storage are working. Your commitments, spending and
        the payday estimate are coming next.
      </p>
    </main>
  );
}
