// The sample month shown to first-time visitors and judges, run through the real engine
// (the same computeOverview the dashboard uses). Nothing on screen is hardcoded.
import { describe, expect, it } from "vitest";
import { payCycle } from "./engine/cycle";
import { addDays, type ISODate } from "./engine/dates";
import { computeOverview } from "./engine/overview";
import type { Commitment, Transaction } from "./engine/types";
import { previewProfile, sampleIsStale, sampleRows, SAMPLE_PAY } from "./sample-data";

const r = (rupees: number) => rupees * 100;

function sampleOverview(today: ISODate, paydayDay = 1) {
  const rows = sampleRows(today, paydayDay);
  const commitments = rows.commitments.map((c, i) => ({ ...c, id: `s${i}`, status: "active", review_status: "unreviewed", end_date: null })) as unknown as Commitment[];
  const transactions = rows.transactions.map((t, i) => ({ ...t, id: `t${i}` })) as unknown as Transaction[];
  // A first-time visitor: nothing saved in their own profile yet.
  const { profile, preview } = previewProfile({ monthly_income_paise: 0, cycle_budget_paise: 0, payday_day: paydayDay, onboarded_at: null }, true);
  return { o: computeOverview({ profile, transactions, commitments, payments: [], today }), preview, rows };
}

describe("sample demo month (25 Oct 2026, payday on the 1st)", () => {
  const { o, preview } = sampleOverview("2026-10-25" as ISODate);

  it("uses example pay and budget only in preview", () => {
    expect(preview).toBe(true);
    expect(SAMPLE_PAY).toEqual({ monthly_income_paise: r(100000), cycle_budget_paise: r(35000) });
  });

  it("income: ₹1,00,000 example pay + ₹5,000 sample freelance income = ₹1,05,000", () => {
    expect(o.incomePaise).toBe(r(105000));
  });

  it("spending: category totals add up to ₹11,879", () => {
    expect(Object.fromEntries(o.spendingByCategory.map((c) => [c.category, c.paise / 100]))).toEqual({
      groceries: 4200, shopping: 3199, food: 2350, transport: 1480, entertainment: 650,
    });
    expect(o.spendingPaise).toBe(r(11879));
  });

  it("budget remaining: ₹35,000 − ₹11,879 = ₹23,121", () => {
    expect(o.budgetLeftPaise).toBe(r(23121));
  });

  it("still due before payday: rent, electricity and Netflix (₹24,449) and the SIP (₹5,000); the card is not counted", () => {
    const counted = o.dueItems.filter((i) => i.bucket !== "reminder").map((i) => `${i.name} ${i.amountPaise / 100}`).sort();
    expect(counted).toEqual(["Electricity 1800", "House rent 22000", "Netflix 649", "Nifty 50 index fund 5000"]);
    expect(o.obligationsDuePaise).toBe(r(24449));
    expect(o.investmentsDuePaise).toBe(r(5000));
    expect(o.plannedInvestmentsPaise).toBe(r(5000));
    // The ₹14,000 HDFC card bill is reminder-only: listed, never subtracted (its purchases
    // are already in recorded spending).
    const card = o.dueItems.find((i) => i.name === "HDFC Millennia")!;
    expect(card).toMatchObject({ bucket: "reminder", amountPaise: r(14000) });
  });

  it("estimated remaining: 1,05,000 − 11,879 − 22,000 − 1,800 − 649 − 5,000 = ₹63,672", () => {
    expect(o.remainingPaise).toBe(r(105000 - 11879 - 22000 - 1800 - 649 - 5000));
    expect(o.remainingPaise).toBe(r(63672));
  });
});

describe("sample demo month is computed, not fixed", () => {
  it("early in a cycle, Spotify and the quarterly gym fee also fall before payday and are counted", () => {
    const { o } = sampleOverview("2026-11-02" as ISODate);
    const names = o.dueItems.filter((i) => i.bucket !== "reminder").map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(["Spotify", "Gym membership"]));
    expect(o.remainingPaise).toBe(r(105000 - 11879 - 22000 - 1800 - 649 - 5000 - 119 - 4500));
  });

  it("every sample record is marked as sample", () => {
    const { rows } = sampleOverview("2026-10-25" as ISODate);
    expect(rows.commitments.every((c) => c.is_sample)).toBe(true);
    expect(rows.transactions.every((t) => t.is_sample && t.source === "sample")).toBe(true);
  });
});

describe("keeping the demo month current", () => {
  const stored = (today: ISODate, payday = 1) => {
    const rows = sampleRows(today, payday);
    return { commitments: rows.commitments.map((c) => ({ ...c, status: "active" })), transactions: rows.transactions };
  };
  const inCycle = (transactions: { occurred_on: string; is_sample: boolean }[], today: ISODate, payday: number) => {
    const c = payCycle(payday, today);
    return transactions.filter((t) => t.occurred_on >= c.start && t.occurred_on <= c.end);
  };

  it("a sample loaded on 25 Oct is current that day, and out of date 10 days later", () => {
    const s = stored("2026-10-25" as ISODate);
    expect(sampleIsStale(s.commitments, inCycle(s.transactions, "2026-10-25" as ISODate, 1), "2026-10-25" as ISODate)).toBe(false);
    expect(sampleIsStale(s.commitments, inCycle(s.transactions, "2026-11-04" as ISODate, 1), "2026-11-04" as ISODate)).toBe(true);
  });

  it("a freshly loaded sample is never out of date, on any day and payday (so it can't reload in a loop)", () => {
    for (let i = 0; i < 400; i++) {
      const today = addDays("2026-10-01" as ISODate, i);
      for (const payday of [1, 5, 15, 28, 31]) {
        const s = stored(today, payday);
        expect(sampleIsStale(s.commitments, inCycle(s.transactions, today, payday), today), `${today} payday ${payday}`).toBe(false);
      }
    }
  });

  it("an account without sample data is never touched", () => {
    expect(sampleIsStale([{ is_sample: false, status: "active", tracking_mode: "outflow", next_due_date: "2020-01-01" as ISODate }], [], "2026-11-04" as ISODate)).toBe(false);
  });
});
