// Ordinary spending and extra income: labels and validation.
import { z } from "zod";
import { addDays, isISODate, type ISODate } from "./engine/dates";
import { parseRupees } from "./money";

// Rent and utilities are deliberately absent: they are commitments (spec §1 classification).
export const EXPENSE_CATEGORIES = [
  { value: "food", label: "Food & dining" },
  { value: "groceries", label: "Groceries" },
  { value: "shopping", label: "Shopping" },
  { value: "transport", label: "Transport" },
  { value: "entertainment", label: "Entertainment" },
  { value: "healthcare", label: "Healthcare" },
  { value: "personal_care", label: "Personal care" },
  { value: "education", label: "Education" },
  { value: "travel", label: "Travel" },
  { value: "other", label: "Other" },
] as const;

export function categoryLabel(value: string): string {
  if (value === "income") return "Extra income";
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? "Other";
}

export function transactionSchema(today: ISODate) {
  const latest = addDays(today, 366);
  return z
    .object({
      kind: z.enum(["expense", "income"]),
      amount: z.string().trim(),
      category: z.string(),
      occurred_on: z.string().trim(),
      note: z.string().trim().max(280, "Keep the note under 280 characters"),
    })
    .transform((v, ctx) => {
      const amount_paise = parseRupees(v.amount);
      if (amount_paise === null || amount_paise === 0) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an amount above ₹0, like 450 or 1299.50" });
      } else if (amount_paise > 1_000_000_000) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "Amounts above ₹1 crore aren't supported" });
      }
      if (v.kind === "expense" && !EXPENSE_CATEGORIES.some((c) => c.value === v.category)) {
        ctx.addIssue({ code: "custom", path: ["category"], message: "Choose a category" });
      }
      if (!isISODate(v.occurred_on) || v.occurred_on < "2000-01-01") {
        ctx.addIssue({ code: "custom", path: ["occurred_on"], message: "Enter a valid date" });
      } else if (v.occurred_on > latest) {
        ctx.addIssue({ code: "custom", path: ["occurred_on"], message: "The date can't be more than a year ahead" });
      }
      return {
        kind: v.kind,
        amount_paise: amount_paise ?? 0,
        category: v.kind === "income" ? "income" : v.category,
        occurred_on: v.occurred_on,
        note: v.note === "" ? null : v.note,
      };
    });
}
