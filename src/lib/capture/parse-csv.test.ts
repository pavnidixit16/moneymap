import { describe, expect, it } from "vitest";
import { parseCsvStatement, readCsv } from "./parse-csv";

const TODAY = "2026-10-22";

describe("readCsv", () => {
  it("handles quotes, commas and newlines inside quotes", () => {
    expect(readCsv('a,"b, c","d ""e"""\r\n1,"two\nlines",3')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "two\nlines", "3"],
    ]);
  });
});

describe("parseCsvStatement", () => {
  const bank = [
    "HDFC BANK STATEMENT,,,,",
    "Account: XX1234,,,,",
    "Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance",
    "01/10/26,OPENING BALANCE,,,50000.00",
    "02/10/26,UPI-ZOMATO-zomato@hdfcbank,450.00,,49550.00",
    '05/10/26,"AMAZON PAY INDIA, BANGALORE","1,299.00",,48251.00',
    "07/10/26,NEFT CR-ACME LTD-SALARY,,\"85,000.00\",133251.00",
    "08/10/26,UPI-SWIGGY-swiggy@icici,450.00,,132801.00",
    "08/10/26,UPI-SWIGGY-swiggy@icici,450.00,,132351.00",
    ",,,,",
    "31/10/26,CLOSING BALANCE,,,132351.00",
  ].join("\n");

  it("reads debits as expenses and credits as income, never the balance", () => {
    const r = parseCsvStatement(bank, TODAY);
    expect(r.error).toBeUndefined();
    expect(r.proposals.map((p) => [p.occurredOn, p.kind, p.amountPaise, p.category])).toEqual([
      ["2026-10-02", "expense", 45000, "food"],
      ["2026-10-05", "expense", 129900, "shopping"],
      ["2026-10-07", "income", 8500000, "income"],
      ["2026-10-08", "expense", 45000, "food"],
      ["2026-10-08", "expense", 45000, "food"],
    ]);
    expect(r.proposals.some((p) => p.amountPaise === 5000000 || p.amountPaise === 13235100)).toBe(false);
    expect(r.skipped.map((s) => s.reason)).toEqual([
      "Balance or summary row (not a transaction)",
      "Balance or summary row (not a transaction)",
    ]);
  });

  it("gives identical rows different references, and the same file the same references", () => {
    const a = parseCsvStatement(bank, TODAY).proposals.map((p) => p.sourceRef);
    const b = parseCsvStatement(bank, TODAY).proposals.map((p) => p.sourceRef);
    expect(new Set(a).size).toBe(a.length);
    expect(b).toEqual(a);
  });

  it("reads a single Amount column with Dr/Cr markers", () => {
    const card = ["Transaction Date,Details,Amount", "20-Oct-2026,FLIPKART,2349.00 Dr", "21-Oct-2026,PAYMENT RECEIVED THANK YOU,15000.00 Cr", "22-Oct-2026,UBER TRIP,-310.50"].join("\n");
    const r = parseCsvStatement(card, TODAY);
    expect(r.proposals.map((p) => [p.occurredOn, p.kind, p.amountPaise])).toEqual([
      ["2026-10-20", "expense", 234900],
      ["2026-10-21", "income", 1500000],
      ["2026-10-22", "expense", 31050],
    ]);
  });

  it("flags rows whose direction is unclear", () => {
    const r = parseCsvStatement(["Date,Description,Amount", "2026-10-20,Something,500"].join("\n"), TODAY);
    expect(r.proposals[0].issues.map((i) => i.field)).toContain("kind");
  });

  it("explains unsupported files instead of guessing", () => {
    expect(parseCsvStatement("hello,world\n1,2", TODAY).error).toMatch(/Date column/);
    expect(parseCsvStatement("x".repeat(1_000_001), TODAY).error).toMatch(/1 MB/);
  });
});
