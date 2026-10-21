import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { TransactionForm } from "../transaction-form";

async function NewForm({ searchParams }: { searchParams: PageProps<"/spending/new">["searchParams"] }) {
  await connection();
  const { kind } = await searchParams;
  // A fresh key per request so a kept-alive page never shows the previous entry.
  return (
    <TransactionForm
      key={crypto.randomUUID()}
      initial={{ kind: kind === "income" ? "income" : "expense", amount: "", category: "food", occurred_on: "", note: "" }}
    />
  );
}

export default function NewTransactionPage({ searchParams }: PageProps<"/spending/new">) {
  return (
    <>
      <PageHeader
        title="Add spending"
        action={
          <Link href="/spending" className="text-sm font-semibold text-accent">
            Cancel
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <NewForm searchParams={searchParams} />
      </Suspense>
    </>
  );
}
