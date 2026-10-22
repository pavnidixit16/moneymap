"use server";

// The single save path for smart entry (text, voice, statements and any future source).
// Nothing is written until the user confirms a draft; every save re-validates here, checks
// for duplicates and card double-counting, and is idempotent per draft.
import { dataChanged } from "@/lib/data-changed";
import { confirmedDraftSchema, DUPLICATE_WINDOW_DAYS, type ConfirmedDraftRow } from "@/lib/capture/draft";
import { requireUser } from "@/lib/data";
import { addDays, istToday } from "@/lib/engine/dates";

export interface DuplicateCandidate {
  id: string;
  occurred_on: string;
  amount_paise: number;
  category: string;
  note: string | null;
  source: string;
}

export interface ConfirmResult {
  saved?: boolean;
  alreadySaved?: boolean;
  duplicates?: DuplicateCandidate[];
  cardWarning?: string;
  errors?: Record<string, string>;
  error?: string;
}

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

// Sources that save several rows at once, each with a stable reference (statement-row
// fingerprint or Gmail message id).
export type BatchSource = "document" | "gmail";
const isBatchSource = (s: unknown): s is BatchSource => s === "document" || s === "gmail";

// Which of these references are already saved. Asked in batches so the request stays
// short even for a 500-row statement.
async function importedRefs(supabase: Supabase, source: BatchSource, refs: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < refs.length; i += 50) {
    const { data } = await supabase.from("transactions").select("source_ref").eq("source", source).in("source_ref", refs.slice(i, i + 50));
    for (const r of data ?? []) found.add(r.source_ref);
  }
  return found;
}

async function findDuplicates(supabase: Supabase, row: Pick<ConfirmedDraftRow, "kind" | "amount_paise" | "occurred_on">) {
  const { data } = await supabase
    .from("transactions")
    .select("id, occurred_on, amount_paise, category, note, source")
    .eq("kind", row.kind)
    .eq("amount_paise", row.amount_paise)
    .gte("occurred_on", addDays(row.occurred_on, -DUPLICATE_WINDOW_DAYS))
    .lte("occurred_on", addDays(row.occurred_on, DUPLICATE_WINDOW_DAYS))
    .limit(5);
  return (data ?? []) as DuplicateCandidate[];
}

// Card purchases are counted as spending when logged. If a card bill is also set to be
// counted ("I don't log card purchases"), logging purchases on it would count them twice.
async function cardDoubleCountWarning(supabase: Supabase, row: ConfirmedDraftRow): Promise<string | undefined> {
  if (row.kind !== "expense" || row.payment_method !== "credit_card") return undefined;
  const { data } = await supabase
    .from("commitments")
    .select("name")
    .eq("kind", "credit_card")
    .eq("status", "active")
    .eq("tracking_mode", "outflow")
    .limit(3);
  if (!data?.length) return undefined;
  const names = data.map((d) => d.name).join(", ");
  return `Your card bill (${names}) is set to count the whole bill. Saving this card purchase too would count it twice. Change the card to "I log card purchases as expenses", or save only if this purchase isn't on that card.`;
}

function fieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const errors: Record<string, string> = {};
  for (const i of error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
  return errors;
}

export async function checkDraft(draft: unknown): Promise<ConfirmResult> {
  const { supabase } = await requireUser();
  const parsed = confirmedDraftSchema(istToday()).safeParse(draft);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const [duplicates, cardWarning] = await Promise.all([findDuplicates(supabase, parsed.data), cardDoubleCountWarning(supabase, parsed.data)]);
  return { duplicates, cardWarning };
}

export async function confirmDraft(
  draft: unknown,
  acknowledged: { duplicates: boolean; card: boolean },
): Promise<ConfirmResult> {
  const { supabase } = await requireUser();
  const parsed = confirmedDraftSchema(istToday()).safeParse(draft);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const row = parsed.data;

  // A retry of a draft that already saved (double tap, timeout) is a success, not a copy.
  const { data: existing } = await supabase.from("transactions").select("id").eq("client_request_id", row.client_request_id).maybeSingle();
  if (existing) return { saved: true, alreadySaved: true };

  const [duplicates, cardWarning] = await Promise.all([findDuplicates(supabase, row), cardDoubleCountWarning(supabase, row)]);
  if (duplicates.length && !acknowledged.duplicates) return { duplicates, cardWarning };
  if (cardWarning && !acknowledged.card) return { duplicates, cardWarning };

  const { error } = await supabase.from("transactions").insert(row);
  if (error) {
    if (error.code === "23505") {
      if (error.message.includes("transactions_user_request_unique")) return { saved: true, alreadySaved: true };
      return { error: "This statement row has already been imported." };
    }
    return { error: "Couldn't save. Your draft is kept; please try again." };
  }
  dataChanged();
  return { saved: true };
}

export interface ImportResult {
  saved?: number;
  alreadyImported?: number;
  invalid?: number;
  error?: string;
}

// Possible duplicates for statement rows: matching entries that did not come from this
// import path, so the user can untick them before saving.
export async function checkImportDuplicates(
  rows: { key: string; kind: "expense" | "income"; amountPaise: number; occurredOn: string; sourceRef: string }[],
  source: BatchSource = "document",
) {
  const { supabase } = await requireUser();
  if (!isBatchSource(source) || !Array.isArray(rows) || rows.length === 0 || rows.length > 500) return { duplicateKeys: [] as string[], importedKeys: [] as string[] };

  const alreadyIn = await importedRefs(supabase, source, rows.map((r) => r.sourceRef));

  const dates = rows.map((r) => r.occurredOn).sort();
  const { data: existing } = await supabase
    .from("transactions")
    .select("kind, amount_paise, occurred_on, source")
    .gte("occurred_on", addDays(dates[0], -DUPLICATE_WINDOW_DAYS))
    .lte("occurred_on", addDays(dates[dates.length - 1], DUPLICATE_WINDOW_DAYS))
    .neq("source", source);
  const duplicateKeys = rows
    .filter((r) =>
      (existing ?? []).some(
        (e) =>
          e.kind === r.kind &&
          e.amount_paise === r.amountPaise &&
          e.occurred_on >= addDays(r.occurredOn, -DUPLICATE_WINDOW_DAYS) &&
          e.occurred_on <= addDays(r.occurredOn, DUPLICATE_WINDOW_DAYS),
      ),
    )
    .map((r) => r.key);
  return { duplicateKeys, importedKeys: rows.filter((r) => alreadyIn.has(r.sourceRef)).map((r) => r.key) };
}

// Saves the statement rows or Gmail drafts the user ticked. Rows already imported are
// skipped (database constraint on source_ref), so re-importing never duplicates anything.
export async function confirmImport(drafts: unknown[], source: BatchSource = "document"): Promise<ImportResult> {
  const { supabase } = await requireUser();
  if (!isBatchSource(source)) return { error: "Unknown source." };
  if (!Array.isArray(drafts) || drafts.length === 0) return { error: "Select at least one row to save." };
  if (drafts.length > 500) return { error: "Too many rows at once." };

  const schema = confirmedDraftSchema(istToday());
  const rows: ConfirmedDraftRow[] = [];
  let invalid = 0;
  for (const d of drafts) {
    const r = schema.safeParse(d);
    if (r.success && r.data.source === source && r.data.source_ref) rows.push(r.data);
    else invalid += 1;
  }

  const done = await importedRefs(supabase, source, rows.map((r) => r.source_ref!));
  const fresh = rows.filter((r) => !done.has(r.source_ref!));
  let alreadyImported = rows.length - fresh.length;
  let saved = 0;

  if (fresh.length) {
    const { error } = await supabase.from("transactions").insert(fresh);
    if (!error) saved = fresh.length;
    else if (error.code === "23505") {
      // Another tab imported some rows meanwhile: fall back to row by row.
      for (const r of fresh) {
        const one = await supabase.from("transactions").insert(r);
        if (!one.error) saved += 1;
        else if (one.error.code === "23505") alreadyImported += 1;
        else invalid += 1;
      }
    } else return { error: "Couldn't save. Nothing was imported; please try again." };
  }

  if (saved) dataChanged();
  return { saved, alreadyImported, invalid };
}
