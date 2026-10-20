import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import { getCommitment, listPayments } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatINR, paiseToInput } from "@/lib/money";
import { cancelCommitment, deleteCommitment, reactivateCommitment } from "../actions";
import { CommitmentForm } from "../commitment-form";

const OUTCOME_LABELS = {
  paid: "Paid",
  skipped: "Didn't need to pay",
  paid_unrecorded: "Paid earlier, amount not recorded",
} as const;

const ERRORS: Record<string, string> = {
  status: "Couldn't change the status. Please try again.",
  delete: "Couldn't delete this commitment. Please try again.",
};

async function EditContent({ params, searchParams }: PageProps<"/commitments/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;

  let commitment, payments;
  try {
    commitment = await getCommitment(id);
    payments = commitment ? await listPayments(id) : [];
  } catch {
    return <ErrorNote>Couldn&apos;t load this commitment. Please refresh the page.</ErrorNote>;
  }
  if (!commitment) notFound();

  return (
    <>
      {typeof error === "string" && ERRORS[error] && <ErrorNote>{ERRORS[error]}</ErrorNote>}
      {commitment.status === "cancelled" && (
        <Card className="flex flex-col gap-2 text-sm">
          <p>
            Marked as cancelled in MoneyMap, so it&apos;s no longer counted. This doesn&apos;t cancel it with the
            provider.
          </p>
          <form action={reactivateCommitment}>
            <input type="hidden" name="id" value={commitment.id} />
            <button type="submit" className="font-medium text-accent underline">
              Reactivate
            </button>
          </form>
        </Card>
      )}

      <CommitmentForm
        key={crypto.randomUUID()}
        initial={{
          id: commitment.id,
          name: commitment.name,
          kind: commitment.kind,
          subtype: commitment.subtype,
          tracking_mode: commitment.tracking_mode,
          amount: commitment.amount_paise > 0 ? paiseToInput(commitment.amount_paise) : "",
          amount_is_estimate: commitment.amount_is_estimate,
          frequency: commitment.frequency,
          next_due_date: commitment.next_due_date ?? "",
          end_date: commitment.end_date ?? "",
          maturity_date: commitment.maturity_date ?? "",
          notes: commitment.notes ?? "",
        }}
      />

      <Card>
        <h2 className="text-sm font-medium text-muted">Payment history</h2>
        {payments.length === 0 ? (
          <p className="pt-2 text-sm text-muted">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2 text-sm">
                <span>
                  Due {formatDate(p.due_date)} · {OUTCOME_LABELS[p.outcome]}
                  {p.paid_on && <span className="text-muted"> on {formatDate(p.paid_on)}</span>}
                </span>
                <span className="font-medium">{p.outcome === "paid" ? formatINR(p.amount_paise) : "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        {commitment.status === "active" && (
          <form action={cancelCommitment} className="flex flex-col gap-1">
            <input type="hidden" name="id" value={commitment.id} />
            <button type="submit" className="self-start font-medium text-accent underline">
              Mark as cancelled
            </button>
            <p className="text-xs text-muted">
              Stops it being counted from now on and keeps its payment history. It doesn&apos;t cancel anything with the
              provider.
            </p>
          </form>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-danger">Delete…</summary>
          <div className="flex flex-col gap-2 pt-2 text-sm">
            <p>
              Deleting removes this commitment <strong>and its payment history</strong>, so totals for past pay cycles
              will change. If you&apos;ve simply stopped paying it, mark it as cancelled instead.
            </p>
            <form action={deleteCommitment}>
              <input type="hidden" name="id" value={commitment.id} />
              <button type="submit" className="h-10 rounded-xl border border-danger px-4 font-medium text-danger">
                Delete permanently
              </button>
            </form>
          </div>
        </details>
      </Card>
    </>
  );
}

export default function EditCommitmentPage(props: PageProps<"/commitments/[id]">) {
  return (
    <>
      <PageHeader
        title="Edit commitment"
        action={
          <Link href="/commitments" className="text-sm font-medium text-accent underline">
            Back
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <EditContent {...props} />
      </Suspense>
    </>
  );
}
