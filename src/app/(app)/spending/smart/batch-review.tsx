"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Badge, inputClass, primaryButton } from "@/components/ui";
import { useHydrated } from "@/components/use-hydrated";
import type { ProposedTransaction } from "@/lib/capture/types";
import { formatDate } from "@/lib/format";
import { formatINR, paiseToInput, parseRupees } from "@/lib/money";
import { categoryLabel, EXPENSE_CATEGORIES } from "@/lib/transactions";
import { checkImportDuplicates, confirmImport, type BatchSource } from "./actions";

export interface BatchItem {
  key: string;
  proposal: ProposedTransaction;
  details?: ReactNode; // e.g. the email's sender and preview
}

interface Row extends BatchItem {
  clientRequestId: string;
  category: string;
  amount: string;
  selected: boolean;
  duplicate: boolean;
  imported: boolean;
}

// A list of drafts from one source (a statement or Gmail). Clear-cut expenses start
// ticked; income, possible duplicates, card-bill payments and anything uncertain start
// unticked. Nothing is saved until the user taps Confirm.
export function BatchReview({
  source,
  items,
  onSaved,
  onDiscard,
  onHide,
  discardLabel = "Discard this import",
}: {
  source: BatchSource;
  items: BatchItem[];
  onSaved: (message: string, savedKeys: string[]) => void;
  onDiscard: () => void;
  onHide?: (key: string) => void;
  discardLabel?: string;
}) {
  const hydrated = useHydrated();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const parsed = items.map((i) => ({
      ...i,
      clientRequestId: crypto.randomUUID(),
      category: i.proposal.category ?? "",
      amount: i.proposal.amountPaise ? paiseToInput(i.proposal.amountPaise) : "",
      selected: false,
      duplicate: false,
      imported: false,
    }));
    const checkable = parsed.filter((r) => r.proposal.amountPaise !== null && r.proposal.occurredOn && r.proposal.sourceRef);
    startTransition(async () => {
      let check: { duplicateKeys: string[]; importedKeys: string[] } = { duplicateKeys: [], importedKeys: [] };
      try {
        if (checkable.length) {
          check = await checkImportDuplicates(
            checkable.map((r) => ({ key: r.key, kind: r.proposal.kind, amountPaise: r.proposal.amountPaise!, occurredOn: r.proposal.occurredOn!, sourceRef: r.proposal.sourceRef! })),
            source,
          );
        }
      } catch {
        setError("Couldn't reach MoneyMap to check for duplicates. Check your connection and try again.");
        return;
      }
      const dup = new Set(check.duplicateKeys);
      const done = new Set(check.importedKeys);
      setRows(
        parsed.map((r) => ({
          ...r,
          duplicate: dup.has(r.key),
          imported: done.has(r.key),
          selected:
            !done.has(r.key) && !dup.has(r.key) && r.proposal.kind === "expense" && r.proposal.amountPaise !== null &&
            !r.proposal.flags.cardBillPayment && !r.proposal.issues.some((i) => i.field === "kind" || i.field === "amount"),
        })),
      );
    });
  }, [items, source]);

  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!rows) return <p className="text-sm text-muted">Checking for duplicates…</p>;

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const savable = (r: Row) => !r.imported && !r.proposal.flags.cardBillPayment;
  const chosen = rows.filter((r) => r.selected && savable(r));
  const missingCategory = chosen.some((r) => r.proposal.kind === "expense" && !r.category);
  const missingAmount = chosen.some((r) => !parseRupees(r.amount));
  const total = chosen.reduce((s, r) => s + (r.proposal.kind === "expense" ? parseRupees(r.amount) ?? 0 : 0), 0);

  function save() {
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof confirmImport>>;
      try {
        result = await confirmImport(
          chosen.map((r) => ({
            clientRequestId: r.clientRequestId,
            source,
            sourceRef: r.proposal.sourceRef,
            kind: r.proposal.kind,
            amount: r.amount,
            description: r.proposal.description || (source === "gmail" ? "Gmail entry" : "Statement entry"),
            category: r.proposal.kind === "income" ? "income" : r.category,
            occurredOn: r.proposal.occurredOn,
            paymentMethod: r.proposal.paymentMethod,
          })),
          source,
        );
      } catch {
        setError("Couldn't reach MoneyMap. Nothing was lost; tap save again (rows already saved won't be duplicated).");
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      const parts = [`Saved ${result.saved} transaction${result.saved === 1 ? "" : "s"}.`];
      if (result.alreadyImported) parts.push(`${result.alreadyImported} already saved earlier, skipped.`);
      if (result.invalid) parts.push(`${result.invalid} couldn't be saved; check the date and amount.`);
      onSaved(parts.join(" "), chosen.map((r) => r.key));
    });
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <li key={r.key} className="flex gap-3 py-3">
            <input
              type="checkbox"
              checked={r.selected && savable(r)}
              // A card bill paid from the bank isn't spending: the purchases on the card are.
              disabled={!savable(r)}
              onChange={(e) => update(r.key, { selected: e.target.checked })}
              aria-label={`Include ${r.proposal.description} ${r.proposal.amountPaise ? formatINR(r.proposal.amountPaise) : ""} on ${r.proposal.occurredOn}`}
              className="mt-1 size-5 accent-[var(--accent)]"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex justify-between gap-2">
                <span className="truncate font-semibold">{r.proposal.description || "Entry"}</span>
                {r.proposal.amountPaise !== null && (
                  <span className={`shrink-0 font-semibold tabular-nums ${r.proposal.kind === "income" ? "text-success" : ""}`}>
                    {r.proposal.kind === "income" ? "+" : "−"}
                    {formatINR(parseRupees(r.amount) ?? r.proposal.amountPaise)}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted">{r.proposal.occurredOn ? formatDate(r.proposal.occurredOn) : "No date"}</span>
              {r.details}
              <div className="flex flex-wrap gap-1">
                {r.imported && <Badge>{source === "gmail" ? "Already saved" : "Already imported"}</Badge>}
                {r.duplicate && <Badge tone="warning">Possible duplicate</Badge>}
                {r.proposal.flags.cardBillPayment && !r.imported && <Badge tone="warning">Card bill payment: can&apos;t be saved as spending. Mark it paid under Commitments</Badge>}
                {r.proposal.kind === "income" && <Badge>Income: off by default</Badge>}
                {r.proposal.issues.some((i) => i.field === "kind") && <Badge tone="warning">Check debit or credit</Badge>}
              </div>
              {r.imported && r.proposal.flags.cardBillPayment && (
                <p className="text-xs text-warning">
                  This card bill was saved as spending in an earlier import, so it may be counted twice. Open it under Spending and delete it.
                </p>
              )}
              {r.proposal.amountPaise === null && savable(r) && (
                <label className="flex flex-col gap-1 text-xs text-warning">
                  {r.proposal.issues.find((i) => i.field === "amount")?.message ?? "Enter the amount."}
                  <input
                    aria-label={`Amount for ${r.proposal.description}`}
                    inputMode="decimal"
                    value={r.amount}
                    onChange={(e) => update(r.key, { amount: e.target.value })}
                    className={`${inputClass} h-9 text-sm`}
                  />
                </label>
              )}
              {r.proposal.kind === "expense" && savable(r) && (
                <select
                  aria-label={`Category for ${r.proposal.description}`}
                  value={r.category}
                  onChange={(e) => update(r.key, { category: e.target.value })}
                  className={`${inputClass} h-9 text-sm`}
                >
                  <option value="">Choose a category</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
              {r.proposal.kind === "expense" && r.category && r.imported && <span className="text-xs text-muted">{categoryLabel(r.category)}</span>}
              {onHide && !r.imported && (
                <button type="button" onClick={() => onHide(r.key)} className="self-start text-xs font-semibold text-muted underline">
                  Not a transaction: hide it
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {missingCategory && <p className="text-sm text-warning">Choose a category for every ticked expense.</p>}
      {missingAmount && <p className="text-sm text-warning">Enter the amount for every ticked row.</p>}
      <button type="button" disabled={!hydrated || pending || chosen.length === 0 || missingCategory || missingAmount} onClick={save} className={primaryButton}>
        {pending ? "Saving…" : `Confirm and save ${chosen.length} selected${total ? ` (${formatINR(total)} spending)` : ""}`}
      </button>
      <button type="button" onClick={onDiscard} className="h-11 rounded-full border border-danger/40 text-sm font-semibold text-danger">
        {discardLabel}
      </button>
    </>
  );
}
