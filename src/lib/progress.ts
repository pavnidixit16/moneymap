// Progress: daily check-ins, streaks and achievements. Pure functions over persisted
// check-in rows, so every number on the Progress screen comes from the database, never from
// a counter in the browser. Days follow India time, like the rest of MoneyMap.
//
// A streak measures consistency in looking after money, not spending less: a no-spend day
// and a day with recorded spending count the same.
import { addDays, parseISODate, type ISODate } from "./engine/dates";

export type CheckinKind = "no_spend" | "reviewed_activity";
export type CheckinStatus = "confirmed" | "needs_review";

export interface CheckinRow {
  local_date: ISODate;
  kind: CheckinKind;
  status: CheckinStatus;
}

export type AchievementKey = "money_mindful" | "consistency_builder" | "transaction_detective" | "streak_3" | "streak_7" | "streak_30";

// Entries confirmed through Smart add's review step (typed, spoken, statement or Gmail).
export const DETECTIVE_REVIEWS = 10;
export const REVIEWED_SOURCES = ["text", "voice", "document", "gmail"] as const;

export const ACHIEVEMENTS: { key: AchievementKey; title: string; description: string; voice?: string }[] = [
  { key: "money_mindful", title: "Money Mindful", description: "Your first check-in." },
  { key: "streak_3", title: "3-day streak", description: "Checked in 3 days in a row.", voice: "Nice work! Three days of staying on top of your money." },
  { key: "consistency_builder", title: "Consistency Builder", description: "Checked in on 5 days in one week (Monday to Sunday)." },
  { key: "transaction_detective", title: "Transaction Detective", description: `Reviewed and confirmed ${DETECTIVE_REVIEWS} entries in Smart add.` },
  { key: "streak_7", title: "7-day streak", description: "A whole week of daily check-ins.", voice: "Amazing! A whole week of consistent money check-ins." },
  { key: "streak_30", title: "30-day streak", description: "Thirty days in a row.", voice: "Fantastic! Thirty days of building a healthy money habit." },
];

export function countedDays(rows: CheckinRow[]): Set<ISODate> {
  return new Set(rows.filter((r) => r.status === "confirmed").map((r) => r.local_date));
}

// Consecutive counted days ending today, or ending yesterday while today is still open
// (the streak isn't lost until a whole day passes without a check-in).
export function currentStreak(days: Set<ISODate>, today: ISODate): { length: number; checkedInToday: boolean } {
  const checkedInToday = days.has(today);
  let d = checkedInToday ? today : addDays(today, -1);
  let length = 0;
  while (days.has(d)) {
    length += 1;
    d = addDays(d, -1);
  }
  return { length, checkedInToday };
}

export function longestStreak(days: Set<ISODate>): number {
  let best = 0;
  for (const d of days) {
    if (days.has(addDays(d, -1))) continue; // not the start of a run
    let length = 1;
    while (days.has(addDays(d, length))) length += 1;
    best = Math.max(best, length);
  }
  return best;
}

// Monday of the week containing `date`.
export function weekStart(date: ISODate): ISODate {
  const { y, m, d } = parseISODate(date);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

export function weekDays(today: ISODate): ISODate[] {
  const start = weekStart(today);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function bestWeekCount(days: Set<ISODate>): number {
  const perWeek = new Map<ISODate, number>();
  for (const d of days) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) ?? 0) + 1);
  return Math.max(0, ...perWeek.values());
}

// Which achievements the persisted history qualifies for. Earned achievements are kept even
// if the user later misses days; this only decides what can be newly added.
export function eligibleAchievements(days: Set<ISODate>, reviewedEntries: number): AchievementKey[] {
  const longest = longestStreak(days);
  const keys: AchievementKey[] = [];
  if (days.size >= 1) keys.push("money_mindful");
  if (longest >= 3) keys.push("streak_3");
  if (bestWeekCount(days) >= 5) keys.push("consistency_builder");
  if (reviewedEntries >= DETECTIVE_REVIEWS) keys.push("transaction_detective");
  if (longest >= 7) keys.push("streak_7");
  if (longest >= 30) keys.push("streak_30");
  return keys;
}

// A short, neutral note for the top of the Progress screen.
export function streakMessage(streak: { length: number; checkedInToday: boolean }, lastCheckin: ISODate | null): string {
  if (streak.checkedInToday) return streak.length === 1 ? "You've checked in today. A new streak starts here." : `You've checked in today. ${streak.length} days in a row.`;
  if (streak.length > 0) return `Check in today to keep your ${streak.length}-day streak going.`;
  if (lastCheckin) return "Welcome back. Every day is a fresh start; check in today to begin a new streak.";
  return "Check in once a day to build a calm money routine.";
}
