import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoJourneyStart, guestDemo, newDemoCommitment } from "./demo-data";
import { payCycle } from "./engine/cycle";
import type { ISODate } from "./engine/dates";
import { computeOverview } from "./engine/overview";

const r = (rupees: number) => rupees * 100;

function overviewOn(today: ISODate) {
  const d = guestDemo(today);
  const cycle = payCycle(d.profile.payday_day, today);
  const transactions = d.transactions.filter((t) => t.occurred_on >= cycle.start && t.occurred_on <= cycle.end);
  return { d, o: computeOverview({ profile: d.profile, transactions, commitments: d.commitments, payments: d.payments, today }) };
}

describe("guest demo (no sign-in)", () => {
  it("is a full sample month through the real engine: ₹63,672 left on 25 Oct 2026", () => {
    const { d, o } = overviewOn("2026-10-25" as ISODate);
    expect(d.profile).toMatchObject({ monthly_income_paise: r(100000), cycle_budget_paise: r(35000), payday_day: 1 });
    expect(o.incomePaise).toBe(r(105000));
    expect(o.spendingPaise).toBe(r(11879));
    expect(o.obligationsDuePaise).toBe(r(22000 + 1800 + 649));
    expect(o.investmentsDuePaise).toBe(r(5000));
    expect(o.remainingPaise).toBe(r(63672));
  });

  it("lists the card bill as reminder-only and never subtracts it", () => {
    const { o } = overviewOn("2026-10-25" as ISODate);
    const card = o.dueItems.find((i) => i.name === "HDFC Millennia")!;
    expect(card).toMatchObject({ bucket: "reminder", amountPaise: r(14000) });
    const counted = o.dueItems.filter((i) => i.bucket !== "reminder").reduce((s, i) => s + i.amountPaise, 0);
    expect(counted).toBe(o.obligationsDuePaise + o.investmentsDuePaise);
  });

  it("stays current on any day: dated from today, nothing overdue", () => {
    for (const today of ["2026-11-12", "2026-11-30", "2027-01-01", "2027-02-28"] as ISODate[]) {
      const { o } = overviewOn(today);
      expect(o.overdueCount, today).toBe(0);
      expect(o.spendingPaise, today).toBeGreaterThan(0);
    }
  });

  it("every record is marked sample, and the demo never imports a database client", () => {
    const { d } = overviewOn("2026-11-12" as ISODate);
    expect(d.commitments.every((c) => c.is_sample && c.id.startsWith("demo-"))).toBe(true);
    expect(d.transactions.every((t) => t.is_sample && t.id.startsWith("demo-"))).toBe(true);
    for (const file of ["./demo-data.ts", "../app/demo/demo-journey.tsx", "../app/demo/page.tsx"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src, file).not.toMatch(/supabase|requireUser|cookies\(/); // type-only imports from ./data are erased
    }
  });
});

describe("demo journey: add commitments, see what's left", () => {
  const today = "2026-11-12" as ISODate;
  const left = (start: ReturnType<typeof demoJourneyStart>, extra: Parameters<typeof newDemoCommitment>[0][] = []) =>
    computeOverview({
      profile: start.profile,
      transactions: start.spending,
      commitments: [...start.commitments, ...extra.map((e, i) => newDemoCommitment(e, `x${i}`)!)],
      payments: [],
      today,
    }).remainingPaise;

  it("starts from six commitments and the sample spending, through the real engine", () => {
    const s = demoJourneyStart(today);
    expect(s.commitments.map((c) => c.name)).toEqual(["House rent", "Car loan EMI", "Nifty 50 index fund", "Electricity", "Netflix", "HDFC Millennia"]);
    // 1,00,000 − spending 11,879 − rent 22,000 − electricity 1,800 − Netflix 649 − SIP 5,000; car EMI is after payday,
    // the card bill is reminder-only.
    expect(left(s)).toBe(r(100000 - 11879 - 22000 - 1800 - 649 - 5000));
  });

  it("an added commitment due before payday reduces what's left by its amount", () => {
    const s = demoJourneyStart(today);
    expect(left(s, [{ type: "subscription", name: "Gym", amountPaise: r(2000), dueDate: "2026-11-20" }])).toBe(left(s) - r(2000));
  });

  it("one due after payday, or a reminder-only card bill, doesn't change this estimate", () => {
    const s = demoJourneyStart(today);
    expect(left(s, [{ type: "emi", name: "Phone EMI", amountPaise: r(3000), dueDate: "2026-12-05" }])).toBe(left(s));
    expect(left(s, [{ type: "card", name: "ICICI card", amountPaise: r(9000), dueDate: "2026-11-20" }])).toBe(left(s));
  });

  it("refuses incomplete entries", () => {
    expect(newDemoCommitment({ type: "rent", name: " ", amountPaise: r(1000), dueDate: "2026-11-20" }, "a")).toBeNull();
    expect(newDemoCommitment({ type: "rent", name: "Rent", amountPaise: null, dueDate: "2026-11-20" }, "a")).toBeNull();
    expect(newDemoCommitment({ type: "rent", name: "Rent", amountPaise: r(1000), dueDate: "" }, "a")).toBeNull();
  });
});
