import { describe, expect, it } from "vitest";
import { assessAfterPayday, assessPurchase, INCOMPLETE_MESSAGE, MESSAGES, monthlyShare } from "./afford";
import { payCycle } from "./cycle";
import { computeOverview, dueItemsUntil } from "./overview";
import type { Commitment, Profile, Transaction } from "./types";

const r = (rupees: number) => rupees * 100;
const TODAY = "2026-10-23";
let n = 0;
const commitment = (o: Partial<Commitment> & Pick<Commitment, "name" | "kind" | "amount_paise" | "next_due_date">): Commitment => ({
  id: `c${++n}`, subtype: "other", tracking_mode: "outflow", amount_is_estimate: false, frequency: "monthly",
  anchor_day: Number(o.next_due_date!.slice(8)), end_date: null, maturity_date: null, status: "active", review_status: "unreviewed", ...o,
});
type TestProfile = Profile & { onboarded_at: string | null };
const profile = (o: Partial<TestProfile> = {}): TestProfile => ({ monthly_income_paise: r(100000), cycle_budget_paise: r(30000), payday_day: 1, onboarded_at: "2026-10-01", ...o });
const spent = (amount: number): Transaction => ({ id: `t${++n}`, kind: "expense", amount_paise: r(amount), category: "food", occurred_on: "2026-10-10" });

// Payday on the 1st: cycle 1 Oct – 31 Oct. Rent ₹25,000 and SIP ₹10,000 still due; card in
// reminder mode (never counted); ₹20,000 spent so far.
const rent = commitment({ name: "Rent", kind: "bill", amount_paise: r(25000), next_due_date: "2026-10-28" });
const sip = commitment({ name: "SIP", kind: "investment", amount_paise: r(10000), next_due_date: "2026-10-30" });
const card = commitment({ name: "HDFC card", kind: "credit_card", tracking_mode: "reminder", amount_paise: r(18000), next_due_date: "2026-10-25" });

function setup(p = profile(), commitments = [rent, sip, card], transactions = [spent(20000)]) {
  const overview = computeOverview({ profile: p, transactions, commitments, payments: [], today: TODAY });
  const input = { overview, hasCommitments: commitments.length > 0, onboarded: Boolean(p.onboarded_at) };
  const next = payCycle(p.payday_day, overview.cycle.nextPayday);
  return { overview, input, next: { items: dueItemsUntil(commitments, [], TODAY, next.end), end: next.end } };
}

describe("Can I afford this?", () => {
  // Estimate today: 1,00,000 − 20,000 − 25,000 − 10,000 = ₹45,000. Breathing room: 10% of
  // income = ₹10,000.
  it("uses the Home estimate, counting each commitment once and never reminder-only cards", () => {
    const { overview, input } = setup();
    expect(overview.remainingPaise).toBe(r(45000));
    const a = assessPurchase(input, r(5000));
    expect(a.beforePaise).toBe(r(45000));
    expect(a.afterPaise).toBe(r(40000));
    expect(a.reasons.map((i) => i.name)).toEqual(["Rent", "SIP"]);
  });

  it("comfortable: plenty left after the planned everyday budget", () => {
    const a = assessPurchase(setup().input, r(6000));
    expect(a).toMatchObject({ level: "comfortable", message: MESSAGES.comfortable, cushionPaise: r(10000) });
  });

  it("tight: less than 10% of income left; exactly 10% is still manageable", () => {
    const a = assessPurchase(setup().input, r(40000));
    expect(a.afterPaise).toBe(r(5000));
    expect(a).toMatchObject({ level: "tight", message: MESSAGES.tight });
    expect(assessPurchase(setup().input, r(35000)).level).toBe("comfortable"); // ₹10,000 left
    expect(assessPurchase(setup().input, r(35001)).level).toBe("tight");
  });

  it("extra income recorded this cycle raises the breathing room with it", () => {
    const withBonus = setup(profile(), [rent, sip, card], [spent(20000), { id: "bonus", kind: "income", amount_paise: r(20000), category: "income", occurred_on: "2026-10-05" }]);
    expect(assessPurchase(withBonus.input, r(1000)).cushionPaise).toBe(r(12000));
  });

  it("short: below zero before payday", () => {
    const a = assessPurchase(setup().input, r(60000));
    expect(a).toMatchObject({ level: "short", afterPaise: r(-15000), message: MESSAGES.short });
  });

  it("uses the same 10% rule without a budget, and says the budget is missing", () => {
    const a = assessPurchase(setup(profile({ cycle_budget_paise: 0 })).input, r(40000));
    expect(a).toMatchObject({ cushionPaise: r(10000), level: "tight" });
    expect(a.limitations.join(" ")).toMatch(/No spending budget is set/);
  });

  it("incomplete: no income means no confident answer", () => {
    const a = assessPurchase(setup(profile({ monthly_income_paise: 0 })).input, r(1000));
    expect(a).toMatchObject({ level: "incomplete", message: INCOMPLETE_MESSAGE });
    expect(assessPurchase(setup(profile({ onboarded_at: null })).input, r(1000)).level).toBe("incomplete");
  });

  it("explains missing commitments and unrecorded spending", () => {
    const a = assessPurchase(setup(profile(), []).input, r(1000));
    expect(a.limitations.join(" ")).toMatch(/haven't added regular payments/);
    expect(a.limitations.join(" ")).toMatch(/not your bank balance/);
  });

  it("after payday: next cycle's commitments and budget, plus any shortfall carried over", () => {
    const { input, next } = setup();
    const later = assessAfterPayday(input, next, r(60000))!;
    // Next cycle: 1,00,000 − rent 25,000 − SIP 10,000 − budget 30,000 = 35,000 → −25,000.
    expect(later).toMatchObject({ from: "2026-11-01", to: "2026-11-30", commitmentsPaise: r(35000), everydayPaise: r(30000), carryPaise: 0, afterPaise: r(-25000), level: "short" });
    // 35,000 − 20,000 = 15,000 left ≥ 10,000 (10%): manageable; 30,000 → 5,000 left: tight.
    expect(assessAfterPayday(input, next, r(20000))!.level).toBe("comfortable");
    expect(assessAfterPayday(input, next, r(30000))!.level).toBe("tight");
    // A shortfall this cycle carries into the next; a surplus doesn't (it may be spent).
    const tightNow = setup(profile(), [rent, sip, card], [spent(80000)]);
    expect(assessAfterPayday(tightNow.input, tightNow.next, r(1000))!.carryPaise).toBe(r(-15000));
  });

  it("never uses shaming language", () => {
    const all = [...Object.values(MESSAGES), INCOMPLETE_MESSAGE].join(" ");
    expect(all).not.toMatch(/can't afford|cannot afford|bad|fail|waste|irresponsible|overspen/i);
  });

  it("spreads a goal into round monthly amounts", () => {
    expect(monthlyShare(r(20000), 3)).toBe(r(6667));
    expect(monthlyShare(r(6000), 2)).toBe(r(3000));
  });
});
