import { Award, Check, Lock } from "lucide-react";
import { Suspense } from "react";
import { Card, ErrorNote, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/data";
import { istToday, type ISODate } from "@/lib/engine/dates";
import { formatDate } from "@/lib/format";
import {
  ACHIEVEMENTS,
  countedDays,
  currentStreak,
  longestStreak,
  streakMessage,
  weekDays,
  type AchievementKey,
  type CheckinRow,
} from "@/lib/progress";
import { syncAchievements } from "@/lib/progress-server";
import { CheckinPanel } from "./checkin-panel";
import { SoundToggle } from "./celebration";

const WEEKDAY = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" });
const LONG_DAY = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const asDate = (iso: ISODate) => new Date(`${iso}T00:00:00Z`);

async function ProgressContent() {
  const { supabase } = await requireUser();
  // Check-ins credited by saving entries elsewhere may have earned something new.
  await syncAchievements(supabase).catch(() => []);
  const [checkins, achievements] = await Promise.all([
    supabase.from("daily_checkins").select("local_date, kind, status").order("local_date", { ascending: false }).limit(800),
    supabase.from("achievements").select("key, earned_at, celebrated_at"),
  ]);
  if (checkins.error || achievements.error) {
    return <ErrorNote>Couldn&apos;t load your progress. Please refresh the page.</ErrorNote>;
  }

  const today = istToday();
  const rows = checkins.data as CheckinRow[];
  const byDate = new Map(rows.map((r) => [r.local_date, r]));
  const days = countedDays(rows);
  const streak = currentStreak(days, today);
  const longest = longestStreak(days);
  const last = rows.find((r) => r.status === "confirmed")?.local_date ?? null;
  const week = weekDays(today);
  const weekCount = week.filter((d) => days.has(d)).length;
  const earned = new Map(achievements.data.map((a) => [a.key as AchievementKey, a]));
  const uncelebrated = achievements.data.filter((a) => !a.celebrated_at).map((a) => a.key as AchievementKey);
  const todayRow = byDate.get(today);

  return (
    <>
      <section aria-label="Streak" className="flex flex-col gap-2 rounded-3xl bg-gradient-to-br from-hero-from to-hero-to p-5 text-white shadow-lg">
        <p className="text-sm text-white/80">Current streak</p>
        <p className="text-4xl font-bold tracking-tight">
          {streak.length} {streak.length === 1 ? "day" : "days"}
        </p>
        <p className="text-sm text-white/90">{streakMessage(streak, last)}</p>
        <p className="text-xs text-white/70">
          {last ? `Last check-in ${formatDate(last)}` : "No check-ins yet"}
          {longest > 1 ? ` · Longest streak ${longest} days` : ""}
        </p>
      </section>

      <Card className="flex flex-col gap-3">
        <SectionTitle>This week</SectionTitle>
        <ol className="grid grid-cols-7 gap-1" aria-label={`This week: checked in on ${weekCount} of 7 days`}>
          {week.map((d) => {
            const row = byDate.get(d);
            const done = days.has(d);
            const future = d > today;
            const state = done
              ? `checked in${row?.kind === "no_spend" ? ", no-spend day" : ", activity reviewed"}`
              : row?.status === "needs_review"
                ? "no-spend withdrawn, spending not recorded yet"
                : future
                  ? "coming up"
                  : d === today
                    ? "not checked in yet"
                    : "no check-in";
            return (
              <li key={d} aria-label={`${LONG_DAY.format(asDate(d))}: ${state}`} className="flex flex-col items-center gap-1">
                <span className={`text-[11px] ${d === today ? "font-semibold text-accent" : "text-muted"}`} aria-hidden>
                  {WEEKDAY.format(asDate(d))}
                </span>
                <span
                  aria-hidden
                  className={`flex size-9 items-center justify-center rounded-full text-xs font-semibold ${
                    done
                      ? "bg-accent text-accent-foreground"
                      : row?.status === "needs_review"
                        ? "border-2 border-dashed border-warning text-warning"
                        : d === today
                          ? "border-2 border-accent text-accent"
                          : future
                            ? "text-muted/60"
                            : "bg-surface-2 text-muted"
                  }`}
                >
                  {done ? <Check className="size-4" strokeWidth={3} /> : asDate(d).getUTCDate()}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-sm text-muted">
          {weekCount} of 7 days this week{weekCount >= 5 ? " · Consistency Builder week" : ""}. Days follow India time.
        </p>
      </Card>

      <CheckinPanel key={today} today={today} todayCheckin={todayRow ? { kind: todayRow.kind, status: todayRow.status } : null} uncelebrated={uncelebrated} />

      <Card className="flex flex-col gap-3">
        <SectionTitle>Achievements</SectionTitle>
        <ul className="grid grid-cols-2 gap-2">
          {ACHIEVEMENTS.map((a) => {
            const got = earned.get(a.key);
            return (
              <li
                key={a.key}
                aria-label={`${a.title}: ${got ? `earned ${formatDate(got.earned_at.slice(0, 10))}` : "not yet earned"}. ${a.description}`}
                className={`flex flex-col gap-1 rounded-xl border p-3 ${got ? "border-accent/30 bg-accent-soft" : "border-border"}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {got ? <Award className="size-4 shrink-0 text-accent" aria-hidden /> : <Lock className="size-4 shrink-0 text-muted" aria-hidden />}
                  {a.title}
                </span>
                <span className="text-xs text-muted">{a.description}</span>
                {got && <span className="text-xs font-medium text-accent">Earned {formatDate(got.earned_at.slice(0, 10))}</span>}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">Achievements are private to you and stay earned, even if you miss a day.</p>
        <SoundToggle />
      </Card>
    </>
  );
}

export default function ProgressPage() {
  return (
    <>
      <PageHeader title="Progress" subtitle="A calm daily money routine" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <ProgressContent />
      </Suspense>
    </>
  );
}
