import { describe, expect, it } from "vitest";
import { addDays, istToday, type ISODate } from "./engine/dates";
import { bestWeekCount, countedDays, currentStreak, eligibleAchievements, longestStreak, streakMessage, weekDays, weekStart, type CheckinRow } from "./progress";

const TODAY = "2026-10-23" as ISODate; // a Friday
const run = (end: ISODate, n: number) => new Set(Array.from({ length: n }, (_, i) => addDays(end, -i)));

describe("streaks", () => {
  it("counts consecutive days ending today", () => {
    expect(currentStreak(run(TODAY, 4), TODAY)).toEqual({ length: 4, checkedInToday: true });
  });

  it("keeps yesterday's streak alive until today ends", () => {
    expect(currentStreak(run(addDays(TODAY, -1), 3), TODAY)).toEqual({ length: 3, checkedInToday: false });
  });

  it("resets after a missed day, and a returning user starts again", () => {
    expect(currentStreak(run(addDays(TODAY, -2), 5), TODAY).length).toBe(0);
    const back = new Set([...run(addDays(TODAY, -10), 5), TODAY]);
    expect(currentStreak(back, TODAY)).toEqual({ length: 1, checkedInToday: true });
    expect(longestStreak(back)).toBe(5);
  });

  it("counts a day once, and only confirmed check-ins", () => {
    const rows: CheckinRow[] = [
      { local_date: TODAY, kind: "no_spend", status: "confirmed" },
      { local_date: addDays(TODAY, -1), kind: "no_spend", status: "needs_review" },
      { local_date: addDays(TODAY, -2), kind: "reviewed_activity", status: "confirmed" },
    ];
    const days = countedDays(rows);
    expect(days.size).toBe(2);
    expect(currentStreak(days, TODAY).length).toBe(1); // the withdrawn no-spend breaks the run
  });

  it("crosses month and year boundaries", () => {
    expect(currentStreak(run("2027-01-02" as ISODate, 5), "2027-01-02" as ISODate).length).toBe(5);
  });

  it("uses India time at midnight", () => {
    // 18:29 UTC on 22 Oct is 23:59 in India; 18:31 UTC is already 23 Oct.
    expect(istToday(new Date(Date.UTC(2026, 9, 22, 18, 29)))).toBe("2026-10-22");
    expect(istToday(new Date(Date.UTC(2026, 9, 22, 18, 31)))).toBe("2026-10-23");
  });
});

describe("weekly calendar", () => {
  it("runs Monday to Sunday", () => {
    expect(weekStart(TODAY)).toBe("2026-10-19");
    expect(weekStart("2026-10-25" as ISODate)).toBe("2026-10-19"); // Sunday
    expect(weekStart("2026-10-26" as ISODate)).toBe("2026-10-26"); // Monday
    expect(weekDays(TODAY)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  });

  it("counts check-ins per calendar week, not per rolling 7 days", () => {
    // Thu–Sun then Mon–Tue: 6 in a row, but only 4 and 2 per calendar week.
    const days = run("2026-10-20" as ISODate, 6);
    expect(bestWeekCount(days)).toBe(4);
    expect(eligibleAchievements(days, 0)).not.toContain("consistency_builder");
    expect(eligibleAchievements(run("2026-10-23" as ISODate, 5), 0)).toContain("consistency_builder");
  });
});

describe("achievements", () => {
  it("are earned by persisted history only", () => {
    expect(eligibleAchievements(new Set(), 0)).toEqual([]);
    expect(eligibleAchievements(run(TODAY, 1), 0)).toEqual(["money_mindful"]);
    expect(eligibleAchievements(run(TODAY, 3), 0)).toEqual(["money_mindful", "streak_3"]);
    expect(eligibleAchievements(run(TODAY, 7), 0)).toEqual(["money_mindful", "streak_3", "consistency_builder", "streak_7"]);
    expect(eligibleAchievements(run(TODAY, 30), 0)).toContain("streak_30");
  });

  it("Transaction Detective needs 10 reviewed entries", () => {
    expect(eligibleAchievements(new Set(), 9)).toEqual([]);
    expect(eligibleAchievements(new Set(), 10)).toEqual(["transaction_detective"]);
  });

  it("a past streak still qualifies after a missed day", () => {
    const days = new Set([...run(addDays(TODAY, -20), 7), TODAY]);
    expect(currentStreak(days, TODAY).length).toBe(1);
    expect(eligibleAchievements(days, 0)).toContain("streak_7");
  });
});

describe("messages never talk about saving money", () => {
  it.each([
    [{ length: 1, checkedInToday: true }, null],
    [{ length: 5, checkedInToday: true }, TODAY],
    [{ length: 3, checkedInToday: false }, addDays(TODAY, -1)],
    [{ length: 0, checkedInToday: false }, addDays(TODAY, -5)],
    [{ length: 0, checkedInToday: false }, null],
  ])("%o", (streak, last) => {
    const m = streakMessage(streak, last);
    expect(m).not.toMatch(/sav|₹|miss(ed)? out|failed|lost/i);
  });
});
