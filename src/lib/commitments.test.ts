import { describe, expect, it } from "vitest";
import { commitmentSchema, defaultTrackingMode, settingsSchema, staleDueDateSuggestion } from "./commitments";

const valid = {
  name: "Rent",
  kind: "bill",
  subtype: "rent",
  tracking_mode: "outflow",
  amount: "22,000",
  amount_is_estimate: false,
  frequency: "monthly",
  next_due_date: "2026-11-05",
  end_date: "",
  maturity_date: "",
  notes: "",
};

describe("defaultTrackingMode", () => {
  it("makes card bills reminder-only and FD/EPF info-only", () => {
    expect(defaultTrackingMode("credit_card", "credit_card")).toBe("reminder");
    expect(defaultTrackingMode("investment", "fd")).toBe("info");
    expect(defaultTrackingMode("investment", "epf")).toBe("info");
    expect(defaultTrackingMode("investment", "sip")).toBe("outflow");
    expect(defaultTrackingMode("bill", "rent")).toBe("outflow");
  });
});

describe("commitmentSchema", () => {
  it("accepts a valid monthly bill and converts the amount to paise", () => {
    const r = commitmentSchema.safeParse(valid);
    expect(r.success && r.data.amount_paise).toBe(2200000);
  });

  it("requires a due date and a positive amount for counted items", () => {
    const r = commitmentSchema.safeParse({ ...valid, next_due_date: "", amount: "0" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["next_due_date", "amount"]));
  });

  it("allows a reminder-only card bill without an amount", () => {
    const r = commitmentSchema.safeParse({ ...valid, kind: "credit_card", subtype: "credit_card", tracking_mode: "reminder", amount: "" });
    expect(r.success && r.data.amount_paise).toBe(0);
  });

  it("strips the schedule from info-only items", () => {
    const r = commitmentSchema.safeParse({
      ...valid,
      kind: "investment",
      subtype: "fd",
      tracking_mode: "info",
      amount: "100000",
      next_due_date: "2026-11-15",
      maturity_date: "2027-11-15",
    });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ next_due_date: null, frequency: "one_time", end_date: null, maturity_date: "2027-11-15" });
  });

  it("allows EPF with no maturity date", () => {
    const r = commitmentSchema.safeParse({ ...valid, kind: "investment", subtype: "epf", tracking_mode: "info", next_due_date: "" });
    expect(r.success).toBe(true);
  });

  it.each([
    [{ subtype: "sip" }, "subtype"],
    [{ end_date: "2026-10-01" }, "end_date"],
    [{ next_due_date: "2026-02-30" }, "next_due_date"],
    [{ amount: "12.345" }, "amount"],
    [{ name: "   " }, "name"],
  ])("rejects %j", (patch, field) => {
    const r = commitmentSchema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path[0]).toBe(field);
  });
});

describe("staleDueDateSuggestion", () => {
  it("suggests the next upcoming date when the entered date is over a period old", () => {
    expect(staleDueDateSuggestion("2026-08-05", "monthly", "2026-10-20")).toBe("2026-11-05");
    expect(staleDueDateSuggestion("2026-08-31", "monthly", "2026-10-20")).toBe("2026-10-31");
  });

  it("stays quiet for dates within one period or one-time items", () => {
    expect(staleDueDateSuggestion("2026-10-05", "monthly", "2026-10-20")).toBeNull();
    expect(staleDueDateSuggestion("2026-01-01", "one_time", "2026-10-20")).toBeNull();
  });
});

describe("settingsSchema", () => {
  it("parses rupees and payday", () => {
    const r = settingsSchema.safeParse({ display_name: "", income: "80,000", budget: "20000", payday_day: "31" });
    expect(r.success && r.data).toEqual({ display_name: null, monthly_income_paise: 8000000, cycle_budget_paise: 2000000, payday_day: 31 });
  });

  it.each([{ payday_day: "0" }, { payday_day: "32" }, { income: "" }, { budget: "-1" }])("rejects %j", (patch) => {
    const r = settingsSchema.safeParse({ display_name: "", income: "80000", budget: "0", payday_day: "1", ...patch });
    expect(r.success).toBe(false);
  });
});
