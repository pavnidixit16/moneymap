// The sample statements offered to testers (public/samples) must import cleanly.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsvStatement } from "./parse-csv";

const read = (name: string) => readFileSync(new URL(`../../../public/samples/${name}`, import.meta.url), "utf8");

describe("sample statements for testers", () => {
  it("bank statement: balances ignored, salary and refund as income, card bill flagged", () => {
    const r = parseCsvStatement(read("moneymap-sample-bank-statement.csv"), "2026-10-25");
    expect(r.error).toBeUndefined();
    expect(r.proposals).toHaveLength(12);
    expect(r.skipped).toHaveLength(2); // opening and closing balance
    expect(r.proposals.filter((p) => p.kind === "income").map((p) => p.amountPaise)).toEqual([8500000, 49900]);
    expect(r.proposals.filter((p) => p.flags.cardBillPayment).map((p) => p.amountPaise)).toEqual([1200000]);
    expect(r.proposals.find((p) => p.amountPaise === 184250)?.category).toBe("groceries");
  });

  it("card statement: Dr/Cr amounts, refund as income", () => {
    const r = parseCsvStatement(read("moneymap-sample-card-statement.csv"), "2026-10-25");
    expect(r.error).toBeUndefined();
    expect(r.proposals).toHaveLength(8);
    expect(r.proposals.filter((p) => p.kind === "income").map((p) => p.amountPaise)).toEqual([79900]);
    expect(r.proposals.reduce((s, p) => s + (p.kind === "expense" ? p.amountPaise! : 0), 0)).toBe(1237700);
    // Every expense gets a category, so testers can confirm without extra taps.
    expect(r.proposals.filter((p) => p.kind === "expense" && !p.category)).toEqual([]);
  });
});
