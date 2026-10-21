import Link from "next/link";
import { Suspense } from "react";

const MESSAGES: Record<string, string> = {
  config: "MoneyMap isn't connected to its database yet. The app owner needs to finish setup.",
  missing_code: "Google didn't return a sign-in code. Please try again.",
  exchange_failed: "We couldn't complete sign-in. The link may have expired; please try again.",
};

async function Message({ searchParams }: { searchParams: PageProps<"/auth/error">["searchParams"] }) {
  const { reason } = await searchParams;
  const message =
    (typeof reason === "string" && MESSAGES[reason]) || "Something went wrong during sign-in.";
  return (
    <p role="alert" className="text-muted">
      {message}
    </p>
  );
}

export default function AuthErrorPage({ searchParams }: PageProps<"/auth/error">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Sign-in problem</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Message searchParams={searchParams} />
      </Suspense>
      <Link href="/login" className="font-semibold text-accent underline">
        Back to sign in
      </Link>
    </main>
  );
}
