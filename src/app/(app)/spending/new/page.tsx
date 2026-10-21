import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { TransactionForm } from "../transaction-form";

async function NewForm() {
  await connection();
  // A fresh key per request so a kept-alive page never shows the previous entry.
  return (
    <TransactionForm
      key={crypto.randomUUID()}
      initial={{ kind: "expense", amount: "", category: "food", occurred_on: "", note: "" }}
    />
  );
}

export default function NewTransactionPage() {
  return (
    <>
      <PageHeader
        title="Add spending"
        action={
          <Link href="/spending" className="text-sm font-medium text-accent underline">
            Back
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <NewForm />
      </Suspense>
    </>
  );
}
