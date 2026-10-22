"use client";

import { FileUp } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge, SuccessNote, inputClass, primaryButton } from "@/components/ui";
import { useHydrated } from "@/components/use-hydrated";
import { MAX_CSV_BYTES, parseCsvStatement } from "@/lib/capture/parse-csv";
import type { ProposedTransaction } from "@/lib/capture/types";
import { istToday } from "@/lib/engine/dates";
import { formatDate } from "@/lib/format";
import { formatINR, paiseToInput } from "@/lib/money";
import { categoryLabel, EXPENSE_CATEGORIES } from "@/lib/transactions";
import { checkImportDuplicates, confirmImport } from "./actions";

interface Row {
  key: string;
  proposal: ProposedTransaction;
  clientRequestId: string;
  category: string;
  selected: boolean;
  duplicate: boolean;
  imported: boolean;
}

const UNSUPPORTED = /\.(pdf|png|jpe?g|heic|webp|xlsx?|txt)$/i;

export function ImportReview() {
  const hydrated = useHydrated();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [skipped, setSkipped] = useState<{ line: number; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    setError(null);
    setMessage(null);
    setRows(null);
    if (!file) return;
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    if (!isCsv) {
      setError(
        UNSUPPORTED.test(file.name)
          ? "PDFs, photos and Excel files aren't supported yet. Most banks and card portals let you download statements as CSV; choose that format."
          : "Only CSV statements are supported.",
      );
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setError("This file is larger than 1 MB. Download a shorter date range.");
      return;
    }
    const result = parseCsvStatement(await file.text(), istToday());
    if (result.error) {
      setError(result.error);
      return;
    }
    setFileName(file.name);
    setSkipped(result.skipped);
    const parsed: Row[] = result.proposals.map((p, i) => ({
      key: String(i),
      proposal: p,
      clientRequestId: crypto.randomUUID(),
      category: p.category ?? "",
      selected: false,
      duplicate: false,
      imported: false,
    }));
    startTransition(async () => {
      let check: { duplicateKeys: string[]; importedKeys: string[] };
      try {
        check = await checkImportDuplicates(
        parsed.map((r) => ({ key: r.key, kind: r.proposal.kind, amountPaise: r.proposal.amountPaise!, occurredOn: r.proposal.occurredOn!, sourceRef: r.proposal.sourceRef! })),
        );
      } catch {
        setError("Couldn't reach MoneyMap to check for duplicates. Check your connection and choose the file again.");
        return;
      }
      const dup = new Set(check.duplicateKeys);
      const done = new Set(check.importedKeys);
      setRows(
        parsed.map((r) => ({
          ...r,
          duplicate: dup.has(r.key),
          imported: done.has(r.key),
          // Pre-tick only clear-cut expenses. Income, possible duplicates, card-bill
          // payments and rows needing review start unticked.
          selected:
            !done.has(r.key) && !dup.has(r.key) && r.proposal.kind === "expense" && !r.proposal.flags.cardBillPayment && !r.proposal.issues.some((i) => i.field === "kind"),
        })),
      );
    });
  }

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const chosen = (rows ?? []).filter((r) => r.selected && !r.imported);
  const missingCategory = chosen.some((r) => r.proposal.kind === "expense" && !r.category);
  const total = chosen.reduce((s, r) => s + (r.proposal.kind === "expense" ? r.proposal.amountPaise! : 0), 0);

  function save() {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof confirmImport>>;
      try {
        result = await confirmImport(
        chosen.map((r) => ({
          clientRequestId: r.clientRequestId,
          source: "document",
          sourceRef: r.proposal.sourceRef,
          kind: r.proposal.kind,
          amount: paiseToInput(r.proposal.amountPaise!),
          description: r.proposal.description || "Statement entry",
          category: r.proposal.kind === "income" ? "income" : r.category,
          occurredOn: r.proposal.occurredOn,
          paymentMethod: r.proposal.paymentMethod,
        })),
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
      if (result.alreadyImported) parts.push(`${result.alreadyImported} already imported earlier, skipped.`);
      if (result.invalid) parts.push(`${result.invalid} couldn't be saved; check the date and amount.`);
      setMessage(parts.join(" "));
      setRows(null);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm">
        Upload a <strong>CSV</strong> bank or card statement (up to 1 MB, 500 rows). It&apos;s read on your device; only the
        rows you confirm are saved. Balances and opening/closing rows are ignored.
      </p>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-accent/50 bg-accent-soft/40 p-4 text-sm font-semibold text-accent">
        <FileUp className="size-5" aria-hidden /> Choose CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={!hydrated}
          aria-label="Statement file"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {message && <SuccessNote>{message}</SuccessNote>}
      {pending && !rows && <p className="text-sm text-muted">Checking for duplicates…</p>}

      {rows && (
        <>
          <p className="text-sm font-semibold">
            {fileName}: {rows.length} transaction{rows.length === 1 ? "" : "s"} found
            {skipped.length > 0 && <span className="font-normal text-muted"> · {skipped.length} balance/summary or unreadable rows ignored</span>}
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((r) => (
              <li key={r.key} className="flex gap-3 py-3">
                <input
                  type="checkbox"
                  checked={r.selected && !r.imported}
                  disabled={r.imported}
                  onChange={(e) => update(r.key, { selected: e.target.checked })}
                  aria-label={`Include ${r.proposal.description} ${formatINR(r.proposal.amountPaise!)} on ${r.proposal.occurredOn}`}
                  className="mt-1 size-5 accent-[var(--accent)]"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-semibold">{r.proposal.description || "Statement entry"}</span>
                    <span className={`shrink-0 font-semibold tabular-nums ${r.proposal.kind === "income" ? "text-success" : ""}`}>
                      {r.proposal.kind === "income" ? "+" : "−"}
                      {formatINR(r.proposal.amountPaise!)}
                    </span>
                  </div>
                  <span className="text-xs text-muted">{formatDate(r.proposal.occurredOn!)}</span>
                  <div className="flex flex-wrap gap-1">
                    {r.imported && <Badge>Already imported</Badge>}
                    {r.duplicate && <Badge tone="warning">Possible duplicate</Badge>}
                    {r.proposal.flags.cardBillPayment && <Badge tone="warning">Card bill payment: mark paid under Commitments</Badge>}
                    {r.proposal.kind === "income" && <Badge>Income: off by default</Badge>}
                    {r.proposal.issues.some((i) => i.field === "kind") && <Badge tone="warning">Check debit or credit</Badge>}
                  </div>
                  {r.proposal.kind === "expense" && !r.imported && (
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
                </div>
              </li>
            ))}
          </ul>
          {missingCategory && <p className="text-sm text-warning">Choose a category for every ticked expense.</p>}
          <button type="button" disabled={!hydrated || pending || chosen.length === 0 || missingCategory} onClick={save} className={primaryButton}>
            {pending ? "Saving…" : `Confirm and save ${chosen.length} selected${total ? ` (${formatINR(total)} spending)` : ""}`}
          </button>
          <button type="button" onClick={() => setRows(null)} className="h-11 rounded-full border border-danger/40 text-sm font-semibold text-danger">
            Discard this import
          </button>
        </>
      )}
    </section>
  );
}
