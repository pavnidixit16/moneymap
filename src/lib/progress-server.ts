// Server-side Progress helpers (not server actions: they take the signed-in user's
// Supabase client from the caller, so row-level security applies).
import type { requireUser } from "./data";
import { countedDays, eligibleAchievements, REVIEWED_SOURCES, type AchievementKey, type CheckinRow } from "./progress";

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

// What the persisted history qualifies for: confirmed check-in days and the number of
// entries confirmed through Smart add's review step.
export async function eligibleNow(supabase: Supabase): Promise<AchievementKey[]> {
  const [{ data: rows }, { count }] = await Promise.all([
    supabase.from("daily_checkins").select("local_date, kind, status"),
    supabase.from("transactions").select("id", { count: "exact", head: true }).in("source", [...REVIEWED_SOURCES]),
  ]);
  return eligibleAchievements(countedDays((rows ?? []) as CheckinRow[]), count ?? 0);
}

// Adds any achievement the history now qualifies for and returns only the new ones.
// Earned achievements are never removed here; the insert ignores ones already earned.
export async function syncAchievements(supabase: Supabase): Promise<AchievementKey[]> {
  const [eligible, { data: earned }] = await Promise.all([eligibleNow(supabase), supabase.from("achievements").select("key")]);
  const have = new Set((earned ?? []).map((a) => a.key));
  const missing = eligible.filter((k) => !have.has(k));
  if (!missing.length) return [];
  const { data } = await supabase
    .from("achievements")
    .upsert(missing.map((key) => ({ key })), { onConflict: "user_id,key", ignoreDuplicates: true })
    .select("key");
  return (data ?? []).map((a) => a.key as AchievementKey);
}
