"use server";

import { dataChanged } from "@/lib/data-changed";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, settingsSchema, type FieldErrors } from "@/lib/commitments";
import { requireUser } from "@/lib/data";
import { istToday } from "@/lib/engine/dates";
import { sampleRows } from "@/lib/sample-data";

export interface SettingsState {
  errors?: FieldErrors;
  saved?: boolean;
}

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { userId, supabase } = await requireUser();

  const parsed = settingsSchema.safeParse({
    display_name: formData.get("display_name") ?? "",
    income: formData.get("income") ?? "",
    budget: formData.get("budget") ?? "",
    payday_day: formData.get("payday_day") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error) };

  const firstTime = formData.get("first_time") === "1";
  const { error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, ...(firstTime ? { onboarded_at: new Date().toISOString() } : {}) })
    .eq("id", userId);
  if (error) return { errors: { form: "Couldn't save your settings. Please try again." } };
  dataChanged();

  if (firstTime) redirect("/commitments?welcome=1");
  return { saved: true };
}

export interface SampleState {
  error?: string;
  message?: string;
}

// Loads example records (all marked is_sample) so testers can explore before entering
// their own. Runs as the signed-in user, so row-level security applies.
export async function loadSampleData(): Promise<SampleState> {
  const { userId, supabase } = await requireUser();
  const { count } = await supabase.from("commitments").select("id", { count: "exact", head: true }).eq("is_sample", true);
  if (count) return { error: "Sample data is already loaded." };

  const { data: profile } = await supabase.from("profiles").select("payday_day").eq("id", userId).single();
  const { commitments, transactions } = sampleRows(istToday(), profile?.payday_day ?? 1);
  const c = await supabase.from("commitments").insert(commitments);
  if (c.error) return { error: "Couldn't load sample data. Please try again." };
  const t = await supabase.from("transactions").insert(transactions);
  if (t.error) {
    await supabase.from("commitments").delete().eq("is_sample", true);
    return { error: "Couldn't load sample data. Please try again." };
  }
  dataChanged();
  return { message: "Sample data loaded. Items are marked Sample; clear them here any time." };
}

// Demo accounts only (never set up): replaces an out-of-date sample month with one dated
// from today. Only sample rows are touched; an account with its own settings is refused.
export async function refreshSampleData(): Promise<SampleState> {
  const { userId, supabase } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("payday_day, onboarded_at").eq("id", userId).single();
  if (!profile || profile.onboarded_at) return { error: "Sample dates are only refreshed in demo mode." };
  const a = await supabase.from("commitments").delete().eq("is_sample", true);
  const b = await supabase.from("transactions").delete().eq("is_sample", true);
  if (a.error || b.error) return { error: "Couldn't update the sample month. Please refresh the page." };
  const { commitments, transactions } = sampleRows(istToday(), profile.payday_day);
  const c = await supabase.from("commitments").insert(commitments);
  const t = c.error ? c : await supabase.from("transactions").insert(transactions);
  if (c.error || t.error) return { error: "Couldn't update the sample month. Please refresh the page." };
  dataChanged();
  return { message: "Sample month updated to today's dates." };
}

export async function clearSampleData(): Promise<SampleState> {
  const { supabase } = await requireUser();
  const a = await supabase.from("commitments").delete().eq("is_sample", true);
  const b = await supabase.from("transactions").delete().eq("is_sample", true);
  if (a.error || b.error) return { error: "Couldn't clear sample data. Please try again." };
  dataChanged();
  return { message: "Sample data removed. Your own records are untouched." };
}
