import { describe, expect, it } from "vitest";
import { commitmentSchema } from "./commitments";
import { payCycle } from "./engine/cycle";
import { computeOverview } from "./engine/overview";
import type { Commitment } from "./engine/types";
import { sampleRows } from "./sample-data";

describe("sample data", () => {
  for (const [today, payday] of [["2026-10-22", 1], ["2026-10-22", 25], ["2026-02-27", 30], ["2026-12-31", 1]] as const) {
    it(`is valid and sensible for ${today}, payday ${payday}`, () => {
      const { commitments, transactions } = sampleRows(today, payday);
      const cycle = payCycle(payday, today);

      for (const c of commitments) {
        const parsed = commitmentSchema.safeParse({
          name: c.name,
          kind: c.kind,
          subtype: c.subtype,
          tracking_mode: c.tracking_mode,
          amount: String(c.amount_paise / 100),
          amount_is_estimate: c.amount_is_estimate,
          frequency: c.frequency,
          next_due_date: c.next_due_date ?? "",
          end_date: "",
          maturity_date: c.maturity_date ?? "",
          provider: c.provider ?? "",
          coverage: c.coverage_paise ? String(c.coverage_paise / 100) : "",
          notes: "",
        });
        expect(parsed.success, c.name).toBe(true);
        if (c.next_due_date && c.next_due_date <= cycle.end) expect(c.next_due_date >= today, c.name).toBe(true);
      }
      for (const t of transactions) {
        expect(t.occurred_on >= cycle.start && t.occurred_on <= today).toBe(true);
      }

      const o = computeOverview({
        profile: { monthly_income_paise: 8000000, cycle_budget_paise: 2500000, payday_day: payday },
        transactions: transactions.map((t, i) => ({ ...t, id: `t${i}`, kind: t.kind as "expense" | "income" })),
        commitments: commitments.map((c, i) => ({ ...c, id: `c${i}`, end_date: null, status: "active", review_status: "unreviewed" }) as unknown as Commitment),
        payments: [],
        today,
      });
      // The FD principal and the reminder-only card bill never reduce the estimate.
      expect(o.dueItems.some((i) => i.name === "SBI fixed deposit")).toBe(false);
      expect(o.dueItems.find((i) => i.name === "HDFC Millennia")?.bucket).toBe("reminder");
      expect(o.remainingPaise).toBeGreaterThan(0);
    });
  }
});
