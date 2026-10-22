// Reads a CSV bank or card statement into proposed transactions. Supported: a header row
// with a date column plus either Debit/Withdrawal and Credit/Deposit columns, or one
// Amount column (negative, or marked Dr/Cr). Balance columns and opening/closing balance
// rows are never treated as transactions. Each row gets a stable fingerprint (sourceRef),
// so importing the same statement twice cannot create duplicates.
import type { ISODate } from "../engine/dates";
import { parseRupees } from "../money";
import { findDate, parseText } from "./parse-text";
import type { ProposedTransaction } from "./types";

export const MAX_CSV_BYTES = 1_000_000;
export const MAX_CSV_ROWS = 500;

export interface CsvResult {
  proposals: ProposedTransaction[];
  skipped: { line: number; reason: string }[];
  error?: string;
}

// Minimal RFC 4180 reader: quoted fields, escaped quotes, commas and newlines in quotes.
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim()));
}

const COLUMN_PATTERNS = {
  date: /^(txn |transaction |value |posting )?date$|^date of transaction$/,
  description: /narration|description|particulars|details|remarks|merchant|transaction details/,
  debit: /debit|withdrawal|dr\b|paid out|spent/,
  credit: /credit|deposit|cr\b|paid in|received/,
  amount: /^(txn |transaction )?amount( \(inr\)| \(rs\.?\)| inr)?$/,
  type: /^(dr ?\/ ?cr|type|cr\/dr|debit\/credit)$/,
  balance: /balance/,
};

function findColumns(header: string[]) {
  const h = header.map((x) => x.toLowerCase().replace(/[.:]/g, "").trim());
  const find = (re: RegExp, exclude: number[] = []) => h.findIndex((x, i) => !exclude.includes(i) && re.test(x));
  const balance = find(COLUMN_PATTERNS.balance);
  const skip = balance >= 0 ? [balance] : [];
  const date = find(COLUMN_PATTERNS.date, skip);
  const description = find(COLUMN_PATTERNS.description, skip);
  const type = find(COLUMN_PATTERNS.type, skip);
  const debit = find(COLUMN_PATTERNS.debit, [...skip, type]);
  const credit = find(COLUMN_PATTERNS.credit, [...skip, debit, type]);
  const amount = find(COLUMN_PATTERNS.amount, skip);
  return { date, description, debit, credit, amount, type, balance };
}

const SUMMARY_ROW = /\b(opening|closing)\s*balance\b|\bbalance\s*(b\/f|c\/f|brought|carried)|^total\b|\bstatement summary\b/i;

function money(cell: string | undefined): number | null {
  if (!cell) return null;
  const cleaned = cell.replace(/(cr|dr)\.?$/i, "").replace(/[-()]/g, "").trim();
  if (!cleaned) return null;
  const paise = parseRupees(cleaned);
  return paise && paise > 0 ? paise : null;
}

export function parseCsvStatement(text: string, today: ISODate): CsvResult {
  if (text.length > MAX_CSV_BYTES) return { proposals: [], skipped: [], error: "This file is larger than 1 MB." };
  const rows = readCsv(text.replace(/^﻿/, ""));

  let headerIndex = -1;
  let cols = findColumns([]);
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const c = findColumns(rows[i]);
    if (c.date >= 0 && (c.debit >= 0 || c.amount >= 0)) {
      headerIndex = i;
      cols = c;
      break;
    }
  }
  if (headerIndex < 0) {
    return {
      proposals: [],
      skipped: [],
      error: "Couldn't find the columns. The CSV needs a header row with a Date column and either Debit/Credit or Amount columns.",
    };
  }

  const proposals: ProposedTransaction[] = [];
  const skipped: CsvResult["skipped"] = [];
  const seen = new Map<string, number>();
  const body = rows.slice(headerIndex + 1);
  if (body.length > MAX_CSV_ROWS) return { proposals: [], skipped: [], error: `This statement has more than ${MAX_CSV_ROWS} rows. Export a shorter date range.` };

  body.forEach((cells, offset) => {
    const line = headerIndex + offset + 2;
    if (cells.every((c) => c === "")) return;
    const narration = cols.description >= 0 ? cells[cols.description] ?? "" : "";
    if (SUMMARY_ROW.test(narration) || SUMMARY_ROW.test(cells.join(" "))) {
      skipped.push({ line, reason: "Balance or summary row (not a transaction)" });
      return;
    }

    const date = findDate((cells[cols.date] ?? "").toLowerCase(), today).date;
    if (!date) {
      skipped.push({ line, reason: "No readable date" });
      return;
    }

    let kind: "expense" | "income" | null = null;
    let amountPaise: number | null = null;
    let kindUnsure = false;
    const debit = cols.debit >= 0 ? money(cells[cols.debit]) : null;
    const credit = cols.credit >= 0 ? money(cells[cols.credit]) : null;
    if (debit) {
      kind = "expense";
      amountPaise = debit;
    } else if (credit) {
      kind = "income";
      amountPaise = credit;
    } else if (cols.amount >= 0) {
      const cell = cells[cols.amount] ?? "";
      amountPaise = money(cell);
      const marker = `${cols.type >= 0 ? cells[cols.type] : ""} ${cell}`.toLowerCase();
      if (/\bcr\b|cr\.?$|^\+/.test(marker.trim()) || /\bcredit\b/.test(marker)) kind = "income";
      else if (/\bdr\b|dr\.?$|^-|\(/.test(marker.trim()) || /\bdebit\b/.test(marker) || cell.trim().startsWith("-")) kind = "expense";
      else {
        kind = "expense";
        kindUnsure = true;
      }
    }
    if (!amountPaise || !kind) {
      skipped.push({ line, reason: "No amount" });
      return;
    }

    // Reuse the text reader for category, description and payment method.
    const read = parseText(narration, today, "document");
    const issues = read.issues.filter((i) => i.field === "category" || i.field === "description");
    if (kindUnsure) issues.push({ field: "kind", message: "The statement doesn't say debit or credit; check this." });

    const base = `${date}|${amountPaise}|${kind}|${narration.toLowerCase().replace(/\s+/g, " ").slice(0, 80)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);

    proposals.push({
      source: "document",
      sourceRef: `csv:${base}|${n}`,
      kind,
      amountPaise,
      description: read.description || narration.slice(0, 60),
      category: kind === "income" ? "income" : read.category,
      occurredOn: date,
      paymentMethod: read.paymentMethod,
      issues,
      flags: kind === "expense" ? read.flags : {},
      raw: narration,
    });
  });

  return { proposals, skipped };
}
