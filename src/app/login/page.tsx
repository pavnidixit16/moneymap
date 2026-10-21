import { CalendarClock, ChartPie, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { GoogleButton } from "./google-button";

async function SignInAction({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next } = await searchParams;
  return <GoogleButton next={typeof next === "string" ? next : undefined} />;
}

const POINTS = [
  { icon: CalendarClock, text: "See every bill, EMI, premium and SIP due before payday" },
  { icon: ChartPie, text: "Know roughly how much remains after what's already committed" },
  { icon: ShieldCheck, text: "No bank access. You enter what you choose; approximate is fine" },
];

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <section className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-hero-from to-hero-to p-6 text-white shadow-lg">
        <p className="text-3xl font-bold tracking-tight">MoneyMap</p>
        <p className="text-lg text-white/90">
          Know what&apos;s already committed, what&apos;s due next, and roughly how much remains until payday.
        </p>
        <ul className="flex flex-col gap-3 pt-1">
          {POINTS.map(({ icon: PointIcon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15">
                <PointIcon className="size-4" aria-hidden />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </section>

      <Suspense fallback={<div className="h-12 rounded-full bg-surface-2" aria-hidden />}>
        <SignInAction searchParams={searchParams} />
      </Suspense>

      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        <h2 className="font-semibold text-foreground">Your privacy</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>MoneyMap has no access to your bank or payment accounts.</li>
          <li>We never ask for banking passwords, card PINs or OTPs.</li>
          <li>
            You enter everything yourself. Approximate amounts are fine. During testing the app owner can technically see
            stored data.
          </li>
        </ul>
        <p className="pt-1">
          MoneyMap is an independent prototype and is not affiliated with any bank or payment app.{" "}
          <Link href="/privacy" className="font-semibold text-accent underline">
            Privacy policy
          </Link>
        </p>
      </section>
    </main>
  );
}
