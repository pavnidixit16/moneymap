import { describe, expect, it } from "vitest";
import { parseText } from "./parse-text";

const TODAY = "2026-10-22"; // a Thursday
const p = (s: string) => parseText(s, TODAY);
const fields = (s: string) => {
  const r = p(s);
  return { kind: r.kind, amount: r.amountPaise, date: r.occurredOn, category: r.category, method: r.paymentMethod, description: r.description };
};

describe("parseText: everyday sentences", () => {
  it("reads the example sentence", () => {
    expect(fields("I spent ₹450 on dinner yesterday")).toEqual({
      kind: "expense", amount: 45000, date: "2026-10-21", category: "food", method: null, description: "Dinner",
    });
    expect(p("I spent ₹450 on dinner yesterday").issues).toEqual([]);
  });

  it.each([
    ["Paid 1,250 rs for groceries at BigBasket today via UPI", { amount: 125000, date: "2026-10-22", category: "groceries", method: "upi" }],
    ["uber 320 rupees last night", { amount: 32000, date: "2026-10-21", category: "transport" }],
    ["Bought shoes for Rs. 3,199.50 on Monday with credit card", { amount: 319950, date: "2026-10-19", category: "shopping", method: "credit_card" }],
    ["movie tickets 2k on 18 Oct", { amount: 200000, date: "2026-10-18", category: "entertainment" }],
    ["pharmacy ₹ 640 on 5/10", { amount: 64000, date: "2026-10-05", category: "healthcare" }],
    ["haircut 300 cash day before yesterday", { amount: 30000, date: "2026-10-20", category: "personal_care", method: "cash" }],
    ["electricity bill 1800 paid via net banking on Oct 3", { amount: 180000, date: "2026-10-03", category: "bills", method: "net_banking" }],
  ])("%s", (text, expected) => {
    expect(fields(text)).toMatchObject(expected);
  });

  it("recognises income", () => {
    expect(fields("Received 5000 from client for freelance work")).toMatchObject({ kind: "income", amount: 500000, category: "income" });
  });
});

describe("parseText: pasted bank and UPI messages", () => {
  it("reads a debit SMS and ignores the masked account and balance", () => {
    const r = p("Rs.450.00 debited from A/c XX1234 on 21-10-26 to VPA zomato@paytm. UPI Ref 629812345678. Avl Bal Rs 12,345.67");
    expect(r).toMatchObject({ kind: "expense", amountPaise: 45000, occurredOn: "2026-10-21", category: "food", paymentMethod: "upi", description: "Zomato" });
    expect(r.issues).toEqual([]);
  });

  it("reads a card spend alert", () => {
    const r = p("INR 2,349.00 spent on ICICI Bank Credit Card XX4321 on 20-Oct-26 at AMAZON. Avl Lmt: INR 1,20,000");
    expect(r).toMatchObject({ amountPaise: 234900, occurredOn: "2026-10-20", category: "shopping", paymentMethod: "credit_card" });
    expect(r.issues).toEqual([]); // the credit limit is not a second amount
  });

  it("reads a credit SMS as income", () => {
    const r = p("Your a/c XX9876 is credited with Rs 85,000.00 on 01/10/2026 by NEFT salary. Avl bal Rs 1,02,000");
    expect(r).toMatchObject({ kind: "income", amountPaise: 8500000, occurredOn: "2026-10-01", paymentMethod: "net_banking" });
  });

  it("never uses a balance as the amount", () => {
    const r = p("Avl Bal Rs 12,345.67 as on 21/10/26");
    expect(r.amountPaise).toBeNull();
    expect(r.issues.map((i) => i.field)).toContain("amount");
  });
});

describe("parseText: uncertainty is reported, not invented", () => {
  it("flags a missing amount, date, category and description", () => {
    const r = p("something happened");
    expect(r.amountPaise).toBeNull();
    expect(r.occurredOn).toBe(TODAY); // shown, but flagged
    expect(r.issues.map((i) => i.field).sort()).toEqual(["amount", "category", "date", "description"]);
  });

  it("flags several amounts", () => {
    expect(p("dinner 450 and taxi 200 yesterday").issues.map((i) => i.field)).toContain("amount");
  });

  it("treats a date without a year that would be in the future as last year", () => {
    expect(p("coffee 250 on 25 Dec").occurredOn).toBe("2025-12-25");
  });

  it("flags explicit future dates", () => {
    expect(p("hotel 9000 on 15/11/2026").issues.map((i) => i.field)).toContain("date");
  });
});

describe("parseText: special cases", () => {
  it("marks a credit-card bill payment so it isn't saved as spending", () => {
    expect(p("Paid credit card bill 18,000 today").flags.cardBillPayment).toBe(true);
    expect(p("dinner 450 on credit card").flags.cardBillPayment).toBeUndefined();
  });

  it("suggests, but does not create, a subscription", () => {
    expect(p("Netflix 649 renewed today").flags.subscriptionHint).toEqual({ name: "Netflix", frequency: "monthly" });
    expect(p("Amazon Prime yearly 1499").flags.subscriptionHint).toEqual({ name: "Amazon Prime", frequency: "yearly" });
  });

  it("keeps the source label", () => {
    expect(parseText("tea 20", TODAY, "voice").source).toBe("voice");
  });
});
