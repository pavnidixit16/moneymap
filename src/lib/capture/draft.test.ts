import { describe, expect, it } from "vitest";
import { confirmedDraftSchema } from "./draft";

const schema = confirmedDraftSchema("2026-10-22");
const good = {
  clientRequestId: "3f2c8a5e-1b2d-4c3e-8f9a-0b1c2d3e4f5a",
  source: "text",
  sourceRef: null,
  kind: "expense",
  amount: "450",
  description: "Dinner",
  category: "food",
  occurredOn: "2026-10-21",
  paymentMethod: "upi",
};

describe("confirmedDraftSchema", () => {
  it("accepts a valid draft and stores paise", () => {
    const r = schema.safeParse(good);
    expect(r.success && r.data).toMatchObject({ amount_paise: 45000, category: "food", note: "Dinner", source: "text", payment_method: "upi" });
  });

  it.each([
    [{ amount: "0" }, "amount"],
    [{ amount: "-5" }, "amount"],
    [{ amount: "abc" }, "amount"],
    [{ occurredOn: "2026-02-30" }, "occurredOn"],
    [{ occurredOn: "2027-12-01" }, "occurredOn"],
    [{ category: "rent" }, "category"],
    [{ description: "  " }, "description"],
    [{ clientRequestId: "not-a-uuid" }, "clientRequestId"],
    [{ source: "carrier-pigeon" }, "source"],
    [{ paymentMethod: "bitcoin" }, "paymentMethod"],
  ])("rejects %j", (patch, field) => {
    const r = schema.safeParse({ ...good, ...patch });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0])).toContain(field);
  });

  it("forces the income category for income", () => {
    const r = schema.safeParse({ ...good, kind: "income", category: "food" });
    expect(r.success && r.data.category).toBe("income");
  });
});
