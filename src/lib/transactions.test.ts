import { describe, expect, it } from "vitest";
import { EXPENSE_CATEGORIES, transactionSchema } from "./transactions";

const schema = transactionSchema("2026-10-21");
const valid = { kind: "expense", amount: "450", category: "food", occurred_on: "2026-10-20", note: "" };

describe("transactionSchema", () => {
  it("accepts an expense and converts to paise", () => {
    const r = schema.safeParse(valid);
    expect(r.success && r.data).toEqual({ kind: "expense", amount_paise: 45000, category: "food", occurred_on: "2026-10-20", note: null });
  });

  it("forces the income category for extra income", () => {
    const r = schema.safeParse({ ...valid, kind: "income", category: "food" });
    expect(r.success && r.data.category).toBe("income");
  });

  it.each([
    [{ amount: "0" }, "amount"],
    [{ amount: "abc" }, "amount"],
    [{ amount: "10000001" }, "amount"],
    [{ category: "rent" }, "category"],
    [{ category: "" }, "category"],
    [{ occurred_on: "" }, "occurred_on"],
    [{ occurred_on: "2027-10-23" }, "occurred_on"],
  ])("rejects %j", (patch, field) => {
    const r = schema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path[0]).toBe(field);
  });

  it("has no rent or utilities categories", () => {
    const values = EXPENSE_CATEGORIES.map((c) => c.value as string);
    expect(values).not.toContain("rent");
    expect(values).not.toContain("utilities");
    expect(values).not.toContain("electricity");
  });
});
