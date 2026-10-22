"use client";

import { FileUp } from "lucide-react";
import { useState } from "react";
import { SuccessNote } from "@/components/ui";
import { useHydrated } from "@/components/use-hydrated";
import { MAX_CSV_BYTES, parseCsvStatement } from "@/lib/capture/parse-csv";
import { istToday } from "@/lib/engine/dates";
import { BatchReview, type BatchItem } from "./batch-review";

const UNSUPPORTED = /\.(pdf|png|jpe?g|heic|webp|xlsx?|txt)$/i;

export function ImportReview() {
  const hydrated = useHydrated();
  const [items, setItems] = useState<BatchItem[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [skipped, setSkipped] = useState<{ line: number; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    setError(null);
    setMessage(null);
    setItems(null);
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
    setItems(result.proposals.map((p, i) => ({ key: String(i), proposal: p })));
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

      {items && (
        <>
          <p className="text-sm font-semibold">
            {fileName}: {items.length} transaction{items.length === 1 ? "" : "s"} found
            {skipped.length > 0 && <span className="font-normal text-muted"> · {skipped.length} balance/summary or unreadable rows ignored</span>}
          </p>
          <BatchReview
            source="document"
            items={items}
            onSaved={(m) => {
              setMessage(m);
              setItems(null);
            }}
            onDiscard={() => setItems(null)}
          />
        </>
      )}
    </section>
  );
}
