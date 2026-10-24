// Server-side data access. Every function verifies the signed-in user first; row-level
// security in the database is the second, independent check.
import { redirect } from "next/navigation";
import { createClient, getVerifiedUserId } from "./supabase/server";
import type { Commitment, Payment } from "./engine/types";

export async function requireUser() {
  const userId = await getVerifiedUserId();
  if (!userId) redirect("/login");
  const supabase = await createClient();
  return { userId, supabase };
}

export interface ProfileRow {
  id: string;
  display_name: string | null;
  monthly_income_paise: number;
  cycle_budget_paise: number;
  payday_day: number;
  onboarded_at: string | null;
}

export async function getProfile(): Promise<ProfileRow> {
  const { userId, supabase } = await requireUser();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, monthly_income_paise, cycle_budget_paise, payday_day, onboarded_at")
    .eq("id", userId)
    .single();
  if (error) throw new Error("Couldn't load your profile.");
  return data;
}

export interface CommitmentRow extends Commitment {
  notes: string | null;
  provider: string | null;
  coverage_paise: number | null;
  is_sample: boolean;
  interest_rate_bps: number | null;
  previous_amount_paise: number | null;
  amount_changed_on: string | null;
  schedule_updated_at: string;
}

const COMMITMENT_COLUMNS =
  "id, name, kind, subtype, tracking_mode, amount_paise, amount_is_estimate, frequency, anchor_day, next_due_date, end_date, maturity_date, status, review_status, notes, schedule_updated_at, provider, coverage_paise, previous_amount_paise, amount_changed_on, is_sample, interest_rate_bps";

export async function listCommitments(): Promise<CommitmentRow[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("commitments").select(COMMITMENT_COLUMNS).order("name");
  if (error) throw new Error("Couldn't load your commitments.");
  return data as CommitmentRow[];
}

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function getCommitment(id: string): Promise<CommitmentRow | null> {
  const { supabase } = await requireUser();
  if (!isUuid(id)) return null;
  const { data, error } = await supabase.from("commitments").select(COMMITMENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error("Couldn't load this commitment.");
  return data as CommitmentRow | null;
}

export interface PaymentRow extends Payment {
  created_at: string;
}

export async function listPayments(commitmentId?: string): Promise<PaymentRow[]> {
  const { supabase } = await requireUser();
  let query = supabase
    .from("commitment_payments")
    .select("id, commitment_id, due_date, outcome, amount_paise, paid_on, created_at")
    .order("due_date", { ascending: false });
  if (commitmentId) query = query.eq("commitment_id", commitmentId);
  const { data, error } = await query;
  if (error) throw new Error("Couldn't load payments.");
  return data as PaymentRow[];
}

export interface TransactionRow {
  id: string;
  kind: "expense" | "income";
  amount_paise: number;
  category: string;
  occurred_on: string;
  note: string | null;
  is_sample: boolean;
  payment_method: string | null;
  source: string;
}

const TRANSACTION_COLUMNS = "id, kind, amount_paise, category, occurred_on, note, is_sample, payment_method, source";

export async function listTransactions(from?: string, to?: string): Promise<TransactionRow[]> {
  const { supabase } = await requireUser();
  let query = supabase.from("transactions").select(TRANSACTION_COLUMNS).order("occurred_on", { ascending: false }).order("created_at", { ascending: false });
  if (from) query = query.gte("occurred_on", from);
  if (to) query = query.lte("occurred_on", to);
  const { data, error } = await query;
  if (error) throw new Error("Couldn't load your spending.");
  return data as TransactionRow[];
}

export async function getTransaction(id: string): Promise<TransactionRow | null> {
  const { supabase } = await requireUser();
  if (!isUuid(id)) return null;
  const { data, error } = await supabase.from("transactions").select(TRANSACTION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error("Couldn't load this entry.");
  return data as TransactionRow | null;
}

export async function listRecentTransactions(limit = 5): Promise<TransactionRow[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_COLUMNS)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Couldn't load your recent transactions.");
  return data as TransactionRow[];
}

// Whether the signed-in user is listed in app_admins (added by the owner in the SQL Editor).
// Row-level security lets a user see only their own admin row, so this can't reveal others.
export async function isAdmin(): Promise<boolean> {
  const { userId, supabase } = await requireUser();
  const { data } = await supabase.from("app_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}
