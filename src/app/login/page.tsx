import { Suspense } from "react";
import { GoogleButton } from "./google-button";

async function SignInAction({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next } = await searchParams;
  return <GoogleButton next={typeof next === "string" ? next : undefined} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">MoneyMap</h1>
        <p className="text-lg text-muted">
          Know what&apos;s already committed, what&apos;s due next, and roughly how much
          remains until payday.
        </p>
      </header>

      <Suspense fallback={<div className="h-12 rounded-xl bg-border" aria-hidden />}>
        <SignInAction searchParams={searchParams} />
      </Suspense>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        <h2 className="font-medium text-foreground">Your privacy</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>MoneyMap has no access to your bank or payment accounts.</li>
          <li>We never ask for banking passwords, card PINs or OTPs.</li>
          <li>
            You enter everything yourself. Approximate amounts are fine. During testing the
            app owner can technically see stored data.
          </li>
        </ul>
        <p className="pt-1">
          MoneyMap is an independent prototype and is not affiliated with any bank or
          payment app.
        </p>
      </section>
    </main>
  );
}
