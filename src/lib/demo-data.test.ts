import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { guestDemo } from "./demo-data";
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
    for (const file of ["demo-data.ts", "demo-load.ts"]) {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(src, file).not.toMatch(/supabase|requireUser|cookies\(/); // type-only imports from ./data are erased
    }
  });
});
