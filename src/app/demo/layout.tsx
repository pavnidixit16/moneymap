import type { Metadata } from "next";
import Link from "next/link";
import { DemoNav } from "./demo-nav";

export const metadata: Metadata = { title: "MoneyMap demo" };

// The guest demo: no sign-in, no account, no database. Everything here is fictional sample
// data built in memory and recalculated by the real engine on each visit.
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-5 pb-28">
        <div role="note" aria-label="Demo mode" className="flex flex-col gap-2 rounded-2xl border border-accent/30 bg-accent-soft p-3 text-sm">
          <p>
            <strong>You&apos;re exploring MoneyMap with sample data. All figures are fictional.</strong> This demo is read-only:
            nothing you see is saved, and it never touches anyone&apos;s account.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/login?next=/settings" className="font-semibold text-accent underline">
              Set up with my own numbers
            </Link>
            <Link href="/login" className="font-semibold text-muted underline">
              Exit demo
            </Link>
          </p>
        </div>
        {children}
      </div>
      <DemoNav />
    </>
  );
}
