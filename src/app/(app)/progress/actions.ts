"use server";

// Progress: the only writes are to daily_checkins and achievements. A check-in never
// creates, changes or deletes a transaction, and never records an amount.
import { dataChanged } from "@/lib/data-changed";
import { requireUser } from "@/lib/data";
import { istToday, type ISODate } from "@/lib/engine/dates";
import type { AchievementKey, CheckinKind } from "@/lib/progress";
import { eligibleNow, syncAchievements } from "@/lib/progress-server";

export interface CheckinResult {
  ok?: boolean;
  kind?: CheckinKind; // what today's check-in is after this call
  alreadyCheckedIn?: boolean; // today already had a check-in: nothing was added
  newAchievements?: AchievementKey[];
  error?: string;
}

const KINDS: CheckinKind[] = ["no_spend", "reviewed_activity"];

// Today's check-in (India time). Safe to repeat: a retry or a second tap finds the
// existing row instead of adding another (the database allows one per user per day).
export async function checkIn(kind: CheckinKind): Promise<CheckinResult> {
  const { supabase } = await requireUser();
  if (!KINDS.includes(kind)) return { error: "Unknown check-in." };
  const today = istToday();

  const { error } = await supabase.from("daily_checkins").insert({ local_date: today, kind });
  if (error && error.code !== "23505") return { error: "Couldn't save your check-in. Nothing was changed; please try again." };

  if (error) {
    // Today already has a check-in (another tab, a retry, or an entry saved earlier).
    const { data: existing } = await supabase.from("daily_checkins").select("kind, status").eq("local_date", today).maybeSingle();
    if (!existing) return { error: "Couldn't save your check-in. Please try again." };
    if (existing.status !== "needs_review") return { ok: true, kind: existing.kind, alreadyCheckedIn: true, newAchievements: [] };
    // The user withdrew a no-spend earlier today and is now confirming again.
    const { error: e } = await supabase.from("daily_checkins").update({ kind, status: "confirmed" }).eq("local_date", today);
    if (e) return { error: "Couldn't save your check-in. Please try again." };
  }

  const newAchievements = await syncAchievements(supabase);
  dataChanged();
  return { ok: true, kind, newAchievements };
}

// "Actually, I spent something": withdraws a no-spend declaration. The day stops counting
// until the user records an expense for it (the database then counts it again). No
// transaction is touched. Achievements earned today that only the withdrawn day made
// possible are removed; anything earned on earlier days stays.
export async function withdrawNoSpend(date: ISODate): Promise<{ ok?: boolean; error?: string }> {
  const { supabase } = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Unknown day." };
  const { data, error } = await supabase
    .from("daily_checkins")
    .update({ status: "needs_review" })
    .eq("local_date", date)
    .eq("kind", "no_spend")
    .eq("status", "confirmed")
    .select("local_date");
  if (error) return { error: "Couldn't change that check-in. Days older than a week can't be changed." };
  if (!data.length) return { ok: true }; // already withdrawn, or not a no-spend day

  const stillEligible = await eligibleNow(supabase);
  let removal = supabase.from("achievements").delete().gte("earned_at", `${istToday()}T00:00:00+05:30`);
  if (stillEligible.length) removal = removal.not("key", "in", `(${stillEligible.join(",")})`);
  await removal;
  dataChanged();
  return { ok: true };
}

// The celebration for these achievements has been shown; never show it again.
export async function markCelebrated(keys: AchievementKey[]): Promise<void> {
  const { supabase } = await requireUser();
  const valid = (Array.isArray(keys) ? keys : []).filter((k) => /^[a-z_0-9]{3,40}$/.test(k));
  if (!valid.length) return;
  await supabase.from("achievements").update({ celebrated_at: new Date().toISOString() }).in("key", valid).is("celebrated_at", null);
}
