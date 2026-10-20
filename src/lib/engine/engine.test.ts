import { describe, expect, it } from "vitest";
import { addMonthsAnchored, istToday } from "./dates";
import { payCycle } from "./cycle";
import { MAX_PROJECTED, nextUnresolvedAfter, projectOccurrences } from "./schedule";
import { comingUp, computeOverview, subscriptionCosts } from "./overview";
import type { Commitment, Payment, Transaction } from "./types";

let seq = 0;
const id = () => `id-${++seq}`;

function commitment(overrides: Partial<Commitment> & Pick<Commitment, "name" | "kind">): Commitment {
  const next = overrides.next_due_date ?? null;
  return {
    id: id(),
    subtype: "other",
    tracking_mode: "outflow",
    amount_paise: 0,
    amount_is_estimate: false,
    frequency: "monthly",
    anchor_day: next ? Number(next.slice(8)) : null,
    next_due_date: next,
    end_date: null,
    maturity_date: null,
    status: "active",
    review_status: "unreviewed",
    ...overrides,
  };
}

const paid = (c: Commitment, due_date: string, amount_paise: number, paid_on: string): Payment => ({
  id: id(),
  commitment_id: c.id,
  due_date,
  outcome: "paid",
  amount_paise,
  paid_on,
});

const expense = (amount_paise: number, occurred_on: string, category = "food"): Transaction => ({
  id: id(),
  kind: "expense",
  amount_paise,
  category,
  occurred_on,
});

const rupees = (r: number) => r * 100;

describe("worked example 1 (payday 1, today 20 Oct 2026)", () => {
  const rent = commitment({ name: "Rent", kind: "bill", subtype: "rent", amount_paise: rupees(22000), next_due_date: "2026-11-05" });
  const emi = commitment({ name: "Car EMI", kind: "loan", amount_paise: rupees(9500), next_due_date: "2026-11-10" });
  const sip = commitment({ name: "SIP", kind: "investment", subtype: "sip", amount_paise: rupees(5000), next_due_date: "2026-11-15" });
  const electricity = commitment({
    name: "Electricity",
    kind: "bill",
    amount_paise: rupees(1800),
    amount_is_estimate: true,
    next_due_date: "2026-10-25",
  });
  const netflix = commitment({ name: "Netflix", kind: "subscription", amount_paise: rupees(649), next_due_date: "2026-10-28" });
  const rd = commitment({ name: "RD", kind: "investment", subtype: "rd", amount_paise: rupees(2000), next_due_date: "2026-10-10" });
  const card = commitment({
    name: "Credit card",
    kind: "credit_card",
    tracking_mode: "reminder",
    amount_paise: rupees(14000),
    next_due_date: "2026-10-22",
  });
  const epf = commitment({ name: "EPF", kind: "investment", subtype: "epf", tracking_mode: "info", amount_paise: rupees(1800) });
  const insurance = commitment({
    name: "Health insurance",
    kind: "insurance",
    amount_paise: rupees(18000),
    frequency: "yearly",
    next_due_date: "2027-03-12",
  });
  const fd = commitment({
    name: "FD",
    kind: "investment",
    subtype: "fd",
    tracking_mode: "info",
    frequency: "one_time",
    amount_paise: rupees(100000),
    maturity_date: "2026-11-15",
  });

  const commitments = [rent, emi, sip, electricity, netflix, rd, card, epf, insurance, fd];
  const payments = [
    paid(rent, "2026-10-05", rupees(22000), "2026-10-05"),
    paid(emi, "2026-10-10", rupees(9500), "2026-10-10"),
    paid(sip, "2026-10-15", rupees(5000), "2026-10-15"),
  ];
  const transactions = [
    expense(rupees(4000), "2026-10-02", "groceries"),
    expense(rupees(2500), "2026-10-05", "food"),
    expense(rupees(1500), "2026-10-08", "transport"),
    expense(rupees(999), "2026-09-30", "food"), // previous cycle: must be ignored
  ];
  const o = computeOverview({
    profile: { monthly_income_paise: rupees(80000), cycle_budget_paise: rupees(20000), payday_day: 1 },
    transactions,
    commitments,
    payments,
    today: "2026-10-20",
  });

  it("uses the 1–31 October cycle", () => {
    expect(o.cycle).toEqual({ start: "2026-10-01", end: "2026-10-31", nextPayday: "2026-11-01" });
  });

  it("reproduces R1–R9 exactly", () => {
    expect(o.incomePaise).toBe(rupees(80000));
    expect(o.spendingPaise).toBe(rupees(8000));
    expect(o.budgetLeftPaise).toBe(rupees(12000));
    expect(o.obligationsPaidPaise).toBe(rupees(31500));
    expect(o.investmentsPaidPaise).toBe(rupees(5000));
    expect(o.obligationsDuePaise).toBe(rupees(2449));
    expect(o.investmentsDuePaise).toBe(rupees(2000));
    expect(o.remainingPaise).toBe(rupees(31051));
    expect(o.plannedInvestmentsPaise).toBe(rupees(7000));
  });

  it("flags the overdue RD and the estimated electricity bill", () => {
    expect(o.overdueCount).toBe(1);
    expect(o.overduePaise).toBe(rupees(2000));
    expect(o.includesEstimates).toBe(true);
    expect(o.dueItems.find((i) => i.name === "RD")?.state).toBe("overdue");
  });

  it("lists the credit card as reminder-only without counting it", () => {
    const cardItem = o.dueItems.find((i) => i.name === "Credit card");
    expect(cardItem?.bucket).toBe("reminder");
    expect(o.dueItems.some((i) => i.name === "EPF" || i.name === "FD")).toBe(false);
  });

  it("breaks spending down by category, largest first", () => {
    expect(o.spendingByCategory).toEqual([
      { category: "groceries", paise: rupees(4000) },
      { category: "food", paise: rupees(2500) },
      { category: "transport", paise: rupees(1500) },
    ]);
  });

  it("shows the FD maturity in coming up but not the March insurance renewal", () => {
    expect(comingUp(commitments, payments, "2026-10-20")).toEqual([
      { commitmentId: fd.id, name: "FD", date: "2026-11-15", type: "maturity" },
    ]);
  });
});

describe("worked example 2 (payday 25, catch-up, early payment)", () => {
  const broadband = commitment({ name: "Broadband", kind: "bill", amount_paise: rupees(1000), next_due_date: "2026-10-05" });
  const rent = commitment({ name: "Rent", kind: "bill", amount_paise: rupees(18000), next_due_date: "2026-12-01" });
  const sip = commitment({ name: "SIP", kind: "investment", amount_paise: rupees(3000), next_due_date: "2026-10-30" });
  const card = commitment({
    name: "Credit card",
    kind: "credit_card",
    tracking_mode: "reminder",
    amount_paise: rupees(9000),
    next_due_date: "2026-10-22",
  });
  const payments: Payment[] = [
    { id: id(), commitment_id: broadband.id, due_date: "2026-08-05", outcome: "paid_unrecorded", amount_paise: 0, paid_on: null },
    paid(broadband, "2026-09-05", rupees(1000), "2026-09-06"),
    paid(rent, "2026-10-01", rupees(18000), "2026-09-30"),
    paid(rent, "2026-11-01", rupees(18000), "2026-10-19"),
    paid(sip, "2026-09-30", rupees(3000), "2026-09-30"),
  ];
  const o = computeOverview({
    profile: { monthly_income_paise: rupees(60000), cycle_budget_paise: rupees(15000), payday_day: 25 },
    transactions: [expense(rupees(9000), "2026-10-01")],
    commitments: [broadband, rent, sip, card],
    payments,
    today: "2026-10-20",
  });

  it("uses the 25 Sep – 24 Oct cycle", () => {
    expect(o.cycle.start).toBe("2026-09-25");
    expect(o.cycle.end).toBe("2026-10-24");
  });

  it("reproduces every figure exactly", () => {
    expect(o.budgetLeftPaise).toBe(rupees(6000));
    expect(o.obligationsPaidPaise).toBe(rupees(36000));
    expect(o.investmentsPaidPaise).toBe(rupees(3000));
    expect(o.obligationsDuePaise).toBe(rupees(1000));
    expect(o.investmentsDuePaise).toBe(0);
    expect(o.remainingPaise).toBe(rupees(11000));
  });

  it("keeps only the unresolved 5 Oct broadband date overdue", () => {
    const broadbandItems = o.dueItems.filter((i) => i.name === "Broadband");
    expect(broadbandItems.map((i) => [i.date, i.state])).toEqual([["2026-10-05", "overdue"]]);
  });
});

describe("pay cycles", () => {
  it("payday 31 clamps to 30 Sep and runs to 30 Oct", () => {
    expect(payCycle(31, "2026-10-20")).toEqual({ start: "2026-09-30", end: "2026-10-30", nextPayday: "2026-10-31" });
    expect(payCycle(31, "2026-10-31")).toEqual({ start: "2026-10-31", end: "2026-11-29", nextPayday: "2026-11-30" });
  });

  it("payday 30 around February 2027", () => {
    expect(payCycle(30, "2027-02-27")).toEqual({ start: "2027-01-30", end: "2027-02-27", nextPayday: "2027-02-28" });
    expect(payCycle(30, "2027-02-28")).toEqual({ start: "2027-02-28", end: "2027-03-29", nextPayday: "2027-03-30" });
  });

  it("payday 1 is the calendar month, including across the year end", () => {
    expect(payCycle(1, "2026-12-31")).toEqual({ start: "2026-12-01", end: "2026-12-31", nextPayday: "2027-01-01" });
    expect(payCycle(1, "2027-01-01")).toEqual({ start: "2027-01-01", end: "2027-01-31", nextPayday: "2027-02-01" });
  });

  it("payday 25 on payday itself starts a new cycle", () => {
    expect(payCycle(25, "2026-10-25").start).toBe("2026-10-25");
    expect(payCycle(25, "2026-01-10").start).toBe("2025-12-25");
  });
});

describe("recurring dates", () => {
  const until = "2032-12-31";

  it("monthly on the 31st returns to the 31st after short months", () => {
    const c = commitment({ name: "x", kind: "bill", next_due_date: "2026-10-31" });
    expect(projectOccurrences(c, "2027-03-31")).toEqual([
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
  });

  it("quarterly from 31 Jan 2027", () => {
    const c = commitment({ name: "x", kind: "bill", frequency: "quarterly", next_due_date: "2027-01-31" });
    expect(projectOccurrences(c, "2027-10-31")).toEqual(["2027-01-31", "2027-04-30", "2027-07-31", "2027-10-31"]);
  });

  it("half-yearly steps six months", () => {
    const c = commitment({ name: "x", kind: "insurance", frequency: "half_yearly", next_due_date: "2026-08-31" });
    expect(projectOccurrences(c, "2027-09-01")).toEqual(["2026-08-31", "2027-02-28", "2027-08-31"]);
  });

  it("yearly on 29 Feb only lands on 29 Feb in leap years", () => {
    const c = commitment({ name: "x", kind: "insurance", frequency: "yearly", next_due_date: "2028-02-29" });
    expect(projectOccurrences(c, "2032-03-01")).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
    ]);
  });

  it("weekly steps seven days across a month end", () => {
    const c = commitment({ name: "x", kind: "subscription", frequency: "weekly", next_due_date: "2026-10-20" });
    expect(projectOccurrences(c, "2026-11-10")).toEqual(["2026-10-20", "2026-10-27", "2026-11-03", "2026-11-10"]);
  });

  it("one-time items have a single date", () => {
    const c = commitment({ name: "x", kind: "other", frequency: "one_time", next_due_date: "2026-11-01" });
    expect(projectOccurrences(c, until)).toEqual(["2026-11-01"]);
    expect(nextUnresolvedAfter(c, "2026-11-01", new Set())).toBeNull();
  });

  it("stops at the end date and ends after the last instalment", () => {
    const c = commitment({ name: "x", kind: "loan", next_due_date: "2026-11-10", end_date: "2027-01-10" });
    expect(projectOccurrences(c, until)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
    expect(nextUnresolvedAfter(c, "2027-01-10", new Set())).toBeNull();
  });

  it("skips dates that already have a payment record (gaps)", () => {
    const c = commitment({ name: "x", kind: "bill", next_due_date: "2026-08-05" });
    const resolved = new Set(["2026-09-05"]);
    expect(projectOccurrences(c, "2026-10-31", resolved)).toEqual(["2026-08-05", "2026-10-05"]);
    expect(nextUnresolvedAfter(c, "2026-08-05", resolved)).toBe("2026-10-05");
  });

  it("never projects more than the safety limit", () => {
    const c = commitment({ name: "x", kind: "subscription", frequency: "weekly", next_due_date: "2000-01-01" });
    expect(projectOccurrences(c, until)).toHaveLength(MAX_PROJECTED);
  });

  it("anchors months to the original day", () => {
    expect(addMonthsAnchored("2027-02-28", 1, 31)).toBe("2027-03-31");
    expect(addMonthsAnchored("2026-12-15", 1, 15)).toBe("2027-01-15");
  });
});

describe("states and exclusions", () => {
  const base = { payday_day: 1, monthly_income_paise: rupees(1000), cycle_budget_paise: 0 };

  it("distinguishes overdue, due today and upcoming", () => {
    const a = commitment({ name: "a", kind: "bill", amount_paise: 100, next_due_date: "2026-10-19" });
    const b = commitment({ name: "b", kind: "bill", amount_paise: 100, next_due_date: "2026-10-20" });
    const c = commitment({ name: "c", kind: "bill", amount_paise: 100, next_due_date: "2026-10-21" });
    const o = computeOverview({ profile: base, transactions: [], commitments: [a, b, c], payments: [], today: "2026-10-20" });
    expect(o.dueItems.map((i) => i.state)).toEqual(["overdue", "due_today", "upcoming"]);
  });

  it("excludes cancelled items from projections but keeps their past payments", () => {
    const c = commitment({ name: "Gym", kind: "subscription", amount_paise: rupees(1500), next_due_date: "2026-10-25", status: "cancelled" });
    const o = computeOverview({
      profile: base,
      transactions: [],
      commitments: [c],
      payments: [paid(c, "2026-09-25", rupees(1500), "2026-10-02")],
      today: "2026-10-20",
    });
    expect(o.obligationsDuePaise).toBe(0);
    expect(o.obligationsPaidPaise).toBe(rupees(1500));
  });

  it("never counts a paid reminder-only item", () => {
    const card = commitment({ name: "Card", kind: "credit_card", tracking_mode: "reminder", amount_paise: rupees(9000), next_due_date: "2026-11-22" });
    const o = computeOverview({
      profile: base,
      transactions: [],
      commitments: [card],
      payments: [paid(card, "2026-10-22", rupees(9000), "2026-10-15")],
      today: "2026-10-20",
    });
    expect(o.obligationsPaidPaise + o.obligationsDuePaise).toBe(0);
  });

  it("does not count skipped or paid-before-tracking dates anywhere", () => {
    const c = commitment({ name: "Bill", kind: "bill", amount_paise: rupees(500), next_due_date: "2026-11-05" });
    const o = computeOverview({
      profile: base,
      transactions: [],
      commitments: [c],
      payments: [
        { id: id(), commitment_id: c.id, due_date: "2026-10-05", outcome: "skipped", amount_paise: 0, paid_on: null },
        { id: id(), commitment_id: c.id, due_date: "2026-09-05", outcome: "paid_unrecorded", amount_paise: 0, paid_on: null },
      ],
      today: "2026-10-20",
    });
    expect(o.remainingPaise).toBe(rupees(1000));
  });

  it("adds extra income entries to the base income", () => {
    const o = computeOverview({
      profile: base,
      transactions: [{ id: id(), kind: "income", amount_paise: rupees(250), category: "income", occurred_on: "2026-10-03" }],
      commitments: [],
      payments: [],
      today: "2026-10-20",
    });
    expect(o.incomePaise).toBe(rupees(1250));
    expect(o.spendingPaise).toBe(0);
  });

  it("warns when commitments leave less than the remaining budget", () => {
    const rent = commitment({ name: "Rent", kind: "bill", amount_paise: rupees(900), next_due_date: "2026-10-25" });
    const o = computeOverview({
      profile: { ...base, cycle_budget_paise: rupees(500) },
      transactions: [],
      commitments: [rent],
      payments: [],
      today: "2026-10-20",
    });
    expect(o.remainingPaise).toBe(rupees(100));
    expect(o.commitmentsExceedBudget).toBe(true);
  });
});

describe("subscription equivalents (R10)", () => {
  it.each([
    ["weekly", 10000, 43333, 520000],
    ["monthly", 64900, 64900, 778800],
    ["quarterly", 30000, 10000, 120000],
    ["half_yearly", 60000, 10000, 120000],
    ["yearly", 149900, 12492, 149900],
    ["one_time", 50000, 0, 0],
  ] as const)("%s", (frequency, amount_paise, monthlyPaise, yearlyPaise) => {
    expect(subscriptionCosts({ amount_paise, frequency })).toEqual({ monthlyPaise, yearlyPaise });
  });
});

describe("today in India", () => {
  it("is already the next day between 00:00 and 05:30 IST", () => {
    expect(istToday(new Date("2026-10-19T19:00:00Z"))).toBe("2026-10-20"); // 00:30 IST
    expect(istToday(new Date("2026-10-19T18:00:00Z"))).toBe("2026-10-19"); // 23:30 IST
  });
});
