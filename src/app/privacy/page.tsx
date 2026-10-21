import Link from "next/link";

export const metadata = { title: "Privacy · MoneyMap" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="text-muted">Last updated 20 October 2026</p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">What MoneyMap is</h2>
        <p>
          MoneyMap is an independent prototype for planning your financial commitments. It is
          being tested with a small group of users. It is not affiliated with any bank or
          payment app.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">What we collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            From Google sign-in: your name, email address and a unique account identifier.
            We do not request access to Gmail, Drive, contacts or any other Google data.
          </li>
          <li>
            What you type in: income, payday, budget, commitments, payments and expenses.
            Approximate amounts are fine.
          </li>
        </ul>
        <p>
          We never ask for banking passwords, card numbers, PINs or OTPs, and MoneyMap has no
          access to your bank or payment accounts. Please don&apos;t enter account numbers in
          notes.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">How it is used and stored</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your data is used only to show you your own overview and calculations.</li>
          <li>
            It is stored in a Supabase database in Mumbai, India, and the app is hosted on
            Vercel. Database rules ensure each account can read and change only its own
            records.
          </li>
          <li>
            During testing, the app owner can technically see stored data for support and
            bug fixing. It is not sold, shared for advertising, or used for any other purpose.
          </li>
          <li>There is no advertising and no third-party analytics.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">Your choices</h2>
        <p>
          You can edit or delete any record in the app. To delete your account and all of
          your data, contact the person who invited you to test MoneyMap; it will be deleted
          within 7 days.
        </p>
      </section>

      <Link href="/login" className="font-semibold text-accent underline">
        Back to MoneyMap
      </Link>
    </main>
  );
}
