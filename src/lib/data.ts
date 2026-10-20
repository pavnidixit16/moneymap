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
  schedule_updated_at: string;
}

const COMMITMENT_COLUMNS =
  "id, name, kind, subtype, tracking_mode, amount_paise, amount_is_estimate, frequency, anchor_day, next_due_date, end_date, maturity_date, status, review_status, notes, schedule_updated_at";

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

export async function listPayments(commitmentId?: string): Promise<Payment[]> {
  const { supabase } = await requireUser();
  let query = supabase
    .from("commitment_payments")
    .select("id, commitment_id, due_date, outcome, amount_paise, paid_on")
    .order("due_date", { ascending: false });
  if (commitmentId) query = query.eq("commitment_id", commitmentId);
  const { data, error } = await query;
  if (error) throw new Error("Couldn't load payments.");
  return data as Payment[];
}
