import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import { getTransaction } from "@/lib/data";
import { paiseToInput } from "@/lib/money";
import { deleteTransaction } from "../actions";
import { TransactionForm } from "../transaction-form";

async function EditContent({ params, searchParams }: PageProps<"/spending/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;
  let t;
  try {
    t = await getTransaction(id);
  } catch {
    return <ErrorNote>Couldn&apos;t load this entry. Please refresh the page.</ErrorNote>;
  }
  if (!t) notFound();

  return (
    <>
      {error === "delete" && <ErrorNote>Couldn&apos;t delete this entry. Please try again.</ErrorNote>}
      <TransactionForm
        key={crypto.randomUUID()}
        initial={{
          id: t.id,
          kind: t.kind,
          amount: paiseToInput(t.amount_paise),
          category: t.kind === "expense" ? t.category : "food",
          occurred_on: t.occurred_on,
          note: t.note ?? "",
          payment_method: t.payment_method ?? "",
        }}
      />
      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-danger">Delete…</summary>
          <form action={deleteTransaction} className="flex flex-col gap-2 pt-2 text-sm">
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="on" value={t.occurred_on} />
            <p>This entry will be removed and your totals updated.</p>
            <button type="submit" className="h-10 self-start rounded-xl border border-danger px-4 font-medium text-danger">
              Delete entry
            </button>
          </form>
        </details>
      </Card>
    </>
  );
}

export default function EditTransactionPage(props: PageProps<"/spending/[id]">) {
  return (
    <>
      <PageHeader
        title="Edit spending"
        action={
          <Link href="/spending" className="text-sm font-semibold text-accent underline">
            Back
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <EditContent {...props} />
      </Suspense>
    </>
  );
}
