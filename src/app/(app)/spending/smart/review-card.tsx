"use client";

import { CircleAlert, CircleCheck, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Badge, inputClass, primaryButton } from "@/components/ui";
import { useHydrated } from "@/components/use-hydrated";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, SOURCE_LABELS, type PaymentMethod, type ProposalField, type ProposedTransaction } from "@/lib/capture/types";
import { formatDate } from "@/lib/format";
import { formatINR, paiseToInput, parseRupees } from "@/lib/money";
import { categoryLabel, EXPENSE_CATEGORIES } from "@/lib/transactions";
import { checkDraft, confirmDraft, type ConfirmResult } from "./actions";

export interface DraftValues {
  kind: "expense" | "income";
  amount: string;
  description: string;
  category: string;
  occurredOn: string;
  paymentMethod: PaymentMethod | "";
}

export function valuesFrom(p: ProposedTransaction): DraftValues {
  return {
    kind: p.kind,
    amount: p.amountPaise ? paiseToInput(p.amountPaise) : "",
    description: p.description,
    category: p.category ?? "",
    occurredOn: p.occurredOn ?? "",
    paymentMethod: p.paymentMethod ?? "",
  };
}

function toDraft(p: ProposedTransaction, v: DraftValues, clientRequestId: string) {
  return {
    clientRequestId,
    source: p.source,
    sourceRef: p.sourceRef,
    kind: v.kind,
    amount: v.amount,
    description: v.description,
    category: v.kind === "income" ? "income" : v.category,
    occurredOn: v.occurredOn,
    paymentMethod: v.paymentMethod || null,
  };
}

export function ReviewCard({
  proposal,
  clientRequestId,
  values,
  onChange,
  onSaved,
  onDiscard,
}: {
  proposal: ProposedTransaction;
  clientRequestId: string;
  values: DraftValues;
  onChange: (v: DraftValues) => void;
  onSaved: (summary: string) => void;
  onDiscard: () => void;
}) {
  const hydrated = useHydrated();
  const [editing, setEditing] = useState(proposal.amountPaise === null);
  const [result, setResult] = useState<ConfirmResult>({});
  const [ackDuplicates, setAckDuplicates] = useState(false);
  const [ackCard, setAckCard] = useState(false);
  const [notCardBill, setNotCardBill] = useState(false);
  const [pending, startTransition] = useTransition();
  const draft = toDraft(proposal, values, clientRequestId);

  // Look for possible duplicates and card double-counting as soon as the draft is shown.
  const checkKey = `${values.kind}|${values.amount}|${values.occurredOn}|${values.paymentMethod}`;
  useEffect(() => {
    let live = true;
    if (parseRupees(values.amount)) {
      checkDraft(toDraft(proposal, values, clientRequestId))
        .then((r) => live && setResult((prev) => ({ ...prev, duplicates: r.duplicates, cardWarning: r.cardWarning })))
        .catch(() => undefined); // the same checks run again on Confirm
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when these fields change
  }, [checkKey]);

  const issuesFor = (field: ProposalField) => proposal.issues.filter((i) => i.field === field);
  const set = (patch: Partial<DraftValues>) => {
    onChange({ ...values, ...patch });
    setResult((r) => ({ ...r, errors: undefined, error: undefined }));
  };

  function confirm() {
    startTransition(async () => {
      let r: ConfirmResult;
      try {
        r = await confirmDraft(draft, { duplicates: ackDuplicates, card: ackCard });
      } catch {
        // Network or server failure: keep the draft; a retry can never double-save.
        setResult((prev) => ({ ...prev, error: "Couldn't reach MoneyMap. Your draft is kept; check your connection and tap Confirm again." }));
        return;
      }
      setResult(r);
      if (r.errors) setEditing(true);
      if (r.saved) {
        const label = values.kind === "income" ? "income" : categoryLabel(values.category);
        onSaved(r.alreadySaved ? `Already saved: ${formatINR(parseRupees(values.amount) ?? 0)} ${label}.` : `Saved ${formatINR(parseRupees(values.amount) ?? 0)} · ${label}.`);
      }
    });
  }

  if (proposal.flags.cardBillPayment && !notCardBill) {
    return (
      <section aria-label="Review draft" className="flex flex-col gap-3 rounded-2xl border border-warning/50 bg-surface p-4">
        <p className="flex gap-2 font-semibold">
          <CircleAlert className="size-5 shrink-0 text-warning" aria-hidden /> This looks like a credit-card bill payment
        </p>
        <p className="text-sm">
          Card purchases are counted as you log them, so saving the bill payment as spending would count the same money
          twice. Mark the card bill as paid under Commitments instead.
        </p>
        <p className="rounded-xl bg-surface-2 p-2 text-sm">
          Read as: <strong>{proposal.description || "Credit card bill"}</strong>
          {proposal.amountPaise ? <> · {formatINR(proposal.amountPaise)}</> : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/commitments?tab=upcoming" className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground">
            Go to Upcoming
          </Link>
          <button type="button" onClick={onDiscard} className="h-10 rounded-full border border-border px-4 text-sm font-semibold">
            Discard
          </button>
        </div>
        <button type="button" onClick={() => { setNotCardBill(true); setEditing(true); }} className="self-start text-sm font-semibold text-accent underline">
          Not a card bill? Review it as spending
        </button>
      </section>
    );
  }

  const errors = result.errors ?? {};
  const needs = (field: ProposalField, key: string) => (issuesFor(field).length > 0 || errors[key]) ? (
    <span className="text-xs text-warning">{errors[key] ?? issuesFor(field)[0].message}</span>
  ) : null;
  const hasDuplicates = (result.duplicates?.length ?? 0) > 0;
  const canConfirm =
    hydrated && !pending && Boolean(parseRupees(values.amount)) && values.description.trim() !== "" && (values.kind === "income" || values.category !== "") &&
    (!hasDuplicates || ackDuplicates) && (!result.cardWarning || ackCard);

  return (
    <section aria-label="Review draft" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Check before saving</h2>
        <Badge tone="accent">{SOURCE_LABELS[proposal.source]}</Badge>
      </div>
      {proposal.issues.length > 0 && (
        <p className="flex gap-2 rounded-xl bg-surface-2 p-2 text-xs">
          <CircleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          {proposal.issues.length} detail{proposal.issues.length === 1 ? "" : "s"} need{proposal.issues.length === 1 ? "s" : ""} review. Nothing is saved until you confirm.
        </p>
      )}

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 rounded-full border border-border p-1" role="group" aria-label="Type">
            {(["expense", "income"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={values.kind === k} onClick={() => set({ kind: k })} className={`flex-1 rounded-full py-1.5 text-sm font-semibold ${values.kind === k ? "bg-accent text-accent-foreground" : "text-muted"}`}>
                {k === "expense" ? "Expense" : "Income"}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Amount (₹)
            <input inputMode="decimal" value={values.amount} onChange={(e) => set({ amount: e.target.value })} className={inputClass} />
            {needs("amount", "amount")}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Description
            <input value={values.description} maxLength={280} onChange={(e) => set({ description: e.target.value })} className={inputClass} />
            {needs("description", "description")}
          </label>
          {values.kind === "expense" && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Category
              <select value={values.category} onChange={(e) => set({ category: e.target.value })} className={inputClass}>
                <option value="">Choose a category</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {needs("category", "category")}
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Date
              <input type="date" value={values.occurredOn} onChange={(e) => set({ occurredOn: e.target.value })} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Paid with
              <select value={values.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as PaymentMethod | "" })} className={inputClass}>
                <option value="">Not specified</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {needs("date", "occurredOn")}
          {needs("kind", "kind")}
        </div>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Amount</dt>
          <dd className="flex flex-col font-semibold">
            {parseRupees(values.amount) ? formatINR(parseRupees(values.amount)!) : "—"} {needs("amount", "amount")}
          </dd>
          <dt className="text-muted">Type</dt>
          <dd className="flex flex-col">
            {values.kind === "expense" ? "Expense" : "Income"} {needs("kind", "kind")}
          </dd>
          <dt className="text-muted">Description</dt>
          <dd className="flex flex-col">
            {values.description || "—"} {needs("description", "description")}
          </dd>
          {values.kind === "expense" && (
            <>
              <dt className="text-muted">Category</dt>
              <dd className="flex flex-col">
                {values.category ? categoryLabel(values.category) : "—"} {needs("category", "category")}
              </dd>
            </>
          )}
          <dt className="text-muted">Date</dt>
          <dd className="flex flex-col">
            {values.occurredOn ? formatDate(values.occurredOn) : "—"} {needs("date", "occurredOn")}
          </dd>
          <dt className="text-muted">Paid with</dt>
          <dd>{values.paymentMethod ? PAYMENT_METHOD_LABELS[values.paymentMethod] : "Not specified"}</dd>
        </dl>
      )}

      {proposal.raw && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">What MoneyMap read</summary>
          <p className="pt-1 break-words whitespace-pre-wrap">{proposal.raw}</p>
        </details>
      )}

      {hasDuplicates && (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/50 p-3 text-sm">
          <p className="font-semibold">Possible duplicate</p>
          <ul className="text-xs text-muted">
            {result.duplicates!.map((d) => (
              <li key={d.id}>
                {formatINR(d.amount_paise)} · {categoryLabel(d.category)} · {formatDate(d.occurred_on, false)}
                {d.note ? ` · ${d.note}` : ""}
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ackDuplicates} onChange={(e) => setAckDuplicates(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            This is a different transaction; save it anyway
          </label>
        </div>
      )}

      {result.cardWarning && (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/50 p-3 text-sm">
          <p>{result.cardWarning}</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ackCard} onChange={(e) => setAckCard(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Save it anyway
          </label>
        </div>
      )}

      {proposal.flags.subscriptionHint && (
        <p className="rounded-xl bg-surface-2 p-2 text-xs">
          Looks like a {proposal.flags.subscriptionHint.frequency} subscription.{" "}
          <Link
            href={`/commitments/new?type=subscription&name=${encodeURIComponent(proposal.flags.subscriptionHint.name)}&amount=${encodeURIComponent(values.amount)}&frequency=${proposal.flags.subscriptionHint.frequency}`}
            className="font-semibold text-accent underline"
          >
            Add {proposal.flags.subscriptionHint.name} as a subscription
          </Link>{" "}
          (optional; nothing is added unless you save it there).
        </p>
      )}

      {result.error && (
        <p role="alert" className="text-sm text-danger">
          {result.error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button type="button" disabled={!canConfirm} onClick={confirm} className={`${primaryButton} flex items-center justify-center gap-2`}>
          <CircleCheck className="size-5" aria-hidden /> {pending ? "Saving…" : "Confirm and save"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setEditing((e) => !e)} className="flex h-11 items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold">
            <Pencil className="size-4" aria-hidden /> {editing ? "Done editing" : "Edit"}
          </button>
          <button type="button" onClick={onDiscard} className="flex h-11 items-center justify-center gap-2 rounded-full border border-danger/40 text-sm font-semibold text-danger">
            <Trash2 className="size-4" aria-hidden /> Discard
          </button>
        </div>
      </div>
    </section>
  );
}
