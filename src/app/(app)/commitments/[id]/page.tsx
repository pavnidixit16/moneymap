import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { commitmentIconName, IconBubble } from "@/components/icons";
import { Badge, Card, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import { MODE_LABELS, subtypeLabel } from "@/lib/commitments";
import { getCommitment, listPayments } from "@/lib/data";
import { formatDate, frequencyLabel } from "@/lib/format";
import { formatINR, paiseToInput } from "@/lib/money";
import { cancelCommitment, deleteCommitment, reactivateCommitment } from "../actions";
import { variantFor } from "@/lib/catalog";
import { CommitmentForm } from "../commitment-form";
import { PaymentControls } from "../settle-controls";

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
      <Card className="flex items-start gap-3">
        <IconBubble name={commitmentIconName(commitment.kind, commitment.subtype)} className="size-12" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-lg font-semibold">{commitment.name}</p>
          <p className="text-xs text-muted">
            {commitment.provider ? `${commitment.provider} · ` : ""}
            {subtypeLabel(commitment.kind, commitment.subtype)}
            {commitment.tracking_mode !== "info" && ` · ${frequencyLabel(commitment.frequency)}`}
          </p>
          <p className="text-sm">
            {commitment.tracking_mode === "info"
              ? commitment.maturity_date
                ? `Matures ${formatDate(commitment.maturity_date)}`
                : "Record only, no payments due"
              : commitment.next_due_date
                ? `Next due ${formatDate(commitment.next_due_date)}`
                : commitment.status === "ended"
                  ? "All payments recorded"
                  : ""}
          </p>
          <div className="flex flex-wrap gap-1">
            <Badge tone={commitment.tracking_mode === "outflow" ? "accent" : "muted"}>
              {commitment.tracking_mode === "outflow" ? "Counted in your estimate" : MODE_LABELS[commitment.tracking_mode].label}
            </Badge>
            {commitment.status === "cancelled" && <Badge tone="danger">Cancelled</Badge>}
            {commitment.status === "ended" && <Badge>Ended</Badge>}
            {commitment.is_sample && <Badge>Sample</Badge>}
          </div>
        </div>
        <p className="shrink-0 text-lg font-semibold tabular-nums">{commitment.amount_paise > 0 ? formatINR(commitment.amount_paise) : "—"}</p>
      </Card>
      {commitment.status === "cancelled" && (
        <Card className="flex flex-col gap-2 text-sm">
          <p>
            Marked as cancelled in MoneyMap, so it&apos;s no longer counted. This doesn&apos;t cancel it with the
            provider.
          </p>
          <form action={reactivateCommitment}>
            <input type="hidden" name="id" value={commitment.id} />
            <button type="submit" className="font-semibold text-accent underline">
              Reactivate
            </button>
          </form>
        </Card>
      )}

      <CommitmentForm
        key={crypto.randomUUID()}
        initial={{
          id: commitment.id,
          variant: variantFor(commitment.kind, commitment.subtype),
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
          provider: commitment.provider ?? "",
          coverage: commitment.coverage_paise ? paiseToInput(commitment.coverage_paise) : "",
          interest_rate: commitment.interest_rate_bps !== null ? String(commitment.interest_rate_bps / 100) : "",
          notes: commitment.notes ?? "",
        }}
      />

      <Card>
        <h2 className="text-sm font-semibold text-muted">Payment history</h2>
        {payments.length === 0 ? (
          <p className="pt-2 text-sm text-muted">No payments recorded yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {payments.map((p, index) => {
                // Only the latest record (by due date) can be undone, and only if the
                // schedule hasn't been edited since it was recorded.
                const isLatest = index === 0;
                const scheduleEdited = Date.parse(p.created_at) < Date.parse(commitment.schedule_updated_at);
                return (
                  <li key={p.id} className="flex flex-col gap-1 py-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <span>
                        Due {formatDate(p.due_date)} · {OUTCOME_LABELS[p.outcome]}
                        {p.paid_on && <span className="text-muted"> on {formatDate(p.paid_on)}</span>}
                      </span>
                      <span className="font-medium">{p.outcome === "paid" ? formatINR(p.amount_paise) : "—"}</span>
                    </div>
                    <PaymentControls
                      key={`${p.id}-${p.amount_paise}-${p.paid_on}`}
                      paymentId={p.id}
                      isPaid={p.outcome === "paid"}
                      amountPaise={p.amount_paise}
                      paidOn={p.paid_on}
                      canUndo={isLatest && !scheduleEdited}
                      undoBlockedReason={
                        isLatest && scheduleEdited ? "Recorded before the schedule was changed, so it can be edited but not undone." : undefined
                      }
                    />
                  </li>
                );
              })}
            </ul>
            <p className="pt-2 text-xs text-muted">
              Undo removes the latest payment and marks that bill unpaid again. To fix an older payment, edit its amount
              or date.
            </p>
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        {commitment.status === "active" && (
          <form action={cancelCommitment} className="flex flex-col gap-1">
            <input type="hidden" name="id" value={commitment.id} />
            <button type="submit" className="self-start font-semibold text-accent underline">
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
          <Link href="/commitments" className="text-sm font-semibold text-accent underline">
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
