// Labels, defaults and validation for commitments, shared by forms and server actions.
import { z } from "zod";
import { isISODate, type ISODate } from "./engine/dates";
import { nextOccurrence } from "./engine/schedule";
import {
  COMMITMENT_KINDS,
  FREQUENCIES,
  TRACKING_MODES,
  type CommitmentKind,
  type Frequency,
  type TrackingMode,
} from "./engine/types";
import { parseRupees } from "./money";

export const KIND_LABELS: Record<CommitmentKind, string> = {
  bill: "Bill or rent",
  loan: "Loan EMI",
  credit_card: "Credit card bill",
  insurance: "Insurance",
  subscription: "Subscription or membership",
  investment: "Savings or investment",
  other: "Other",
};

export const SECTION_ORDER: { title: string; kinds: CommitmentKind[] }[] = [
  { title: "Bills", kinds: ["bill"] },
  { title: "Loans & cards", kinds: ["loan", "credit_card"] },
  { title: "Insurance", kinds: ["insurance"] },
  { title: "Subscriptions", kinds: ["subscription"] },
  { title: "Savings & investments", kinds: ["investment"] },
  { title: "Other", kinds: ["other"] },
];

export const SUBTYPES: Record<CommitmentKind, { value: string; label: string }[]> = {
  bill: [
    { value: "rent", label: "Rent" },
    { value: "maintenance", label: "Maintenance" },
    { value: "electricity", label: "Electricity" },
    { value: "water", label: "Water" },
    { value: "gas", label: "Gas" },
    { value: "internet", label: "Internet / broadband" },
    { value: "mobile", label: "Mobile" },
    { value: "education", label: "Education fees" },
    { value: "other", label: "Other bill" },
  ],
  loan: [
    { value: "home_loan", label: "Home loan" },
    { value: "vehicle_loan", label: "Vehicle loan" },
    { value: "personal_loan", label: "Personal loan" },
    { value: "education_loan", label: "Education loan" },
    { value: "other", label: "Other repayment" },
  ],
  credit_card: [{ value: "credit_card", label: "Credit card" }],
  insurance: [
    { value: "health", label: "Health" },
    { value: "life", label: "Life" },
    { value: "vehicle", label: "Vehicle" },
    { value: "other", label: "Other policy" },
  ],
  subscription: [
    { value: "ott", label: "Video streaming (OTT)" },
    { value: "music", label: "Music" },
    { value: "software", label: "Software / apps" },
    { value: "gym", label: "Gym / fitness" },
    { value: "other", label: "Other subscription" },
  ],
  investment: [
    { value: "sip", label: "SIP / mutual fund" },
    { value: "rd", label: "Recurring deposit (RD)" },
    { value: "fd", label: "Fixed deposit (FD)" },
    { value: "ppf", label: "PPF" },
    { value: "epf", label: "EPF" },
    { value: "other", label: "Other savings" },
  ],
  other: [{ value: "other", label: "Other" }],
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  one_time: "One-time",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Yearly",
};

export const MODE_LABELS: Record<TrackingMode, { label: string; help: string }> = {
  outflow: {
    label: "Count it",
    help: "Included in what's due and in your estimate.",
  },
  reminder: {
    label: "Reminder only",
    help: "Shows the due date but is never counted. Use for card bills whose spending you log as expenses.",
  },
  info: {
    label: "Info only",
    help: "No payments due; only a maturity or renewal date. Use for FDs you've already made, or EPF deducted before your salary.",
  },
};

export function defaultTrackingMode(kind: CommitmentKind, subtype: string): TrackingMode {
  if (kind === "credit_card") return "reminder";
  if (kind === "investment" && (subtype === "fd" || subtype === "epf")) return "info";
  return "outflow";
}

export function subtypeLabel(kind: CommitmentKind, subtype: string): string {
  return SUBTYPES[kind].find((s) => s.value === subtype)?.label ?? "Other";
}

// When a first due date is more than one period in the past, suggest the first date on
// the same schedule that is today or later (spec §8: avoid piles of overdue dates).
export function staleDueDateSuggestion(
  nextDue: ISODate,
  frequency: Frequency,
  today: ISODate,
): ISODate | null {
  if (frequency === "one_time") return null;
  const anchor = Number(nextDue.slice(8));
  let date = nextOccurrence(nextDue, frequency, anchor);
  if (!date || date >= today) return null;
  for (let i = 0; i < 1000 && date && date < today; i++) {
    date = nextOccurrence(date, frequency, anchor);
  }
  return date;
}

// ---------------------------------------------------------------------------
// Validation (runs on the server for every save; the database re-checks the rules).
// ---------------------------------------------------------------------------
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || (isISODate(v) && v >= "2000-01-01" && v <= "2100-12-31"), "Enter a valid date");

export const commitmentSchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(80, "Keep the name under 80 characters"),
    kind: z.enum(COMMITMENT_KINDS),
    subtype: z.string(),
    tracking_mode: z.enum(TRACKING_MODES),
    amount: z.string().trim(),
    amount_is_estimate: z.boolean(),
    frequency: z.enum(FREQUENCIES),
    next_due_date: optionalDate,
    end_date: optionalDate,
    maturity_date: optionalDate,
    provider: z
      .string()
      .trim()
      .max(80, "Keep this under 80 characters")
      .transform((v) => (v === "" ? null : v)),
    coverage: z.string().trim(),
    notes: z
      .string()
      .trim()
      .max(500, "Keep notes under 500 characters")
      .transform((v) => (v === "" ? null : v)),
  })
  .transform((v, ctx) => {
    if (!SUBTYPES[v.kind].some((s) => s.value === v.subtype)) {
      ctx.addIssue({ code: "custom", path: ["subtype"], message: "Choose a type" });
    }

    let amount_paise = 0;
    if (v.amount === "") {
      if (v.tracking_mode === "outflow") {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter the amount (an estimate is fine)" });
      }
    } else {
      const parsed = parseRupees(v.amount);
      if (parsed === null) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an amount like 1200 or 649.50" });
      } else if (parsed > 10_000_000_000) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "That amount is too large" });
      } else if (parsed === 0 && v.tracking_mode === "outflow") {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an amount above ₹0" });
      } else {
        amount_paise = parsed;
      }
    }

    let coverage_paise: number | null = null;
    if (v.coverage !== "") {
      const parsed = parseRupees(v.coverage);
      if (parsed === null) {
        ctx.addIssue({ code: "custom", path: ["coverage"], message: "Enter a cover amount like 1000000" });
      } else if (parsed > 100_000_000_000) {
        ctx.addIssue({ code: "custom", path: ["coverage"], message: "That amount is too large" });
      } else {
        coverage_paise = parsed;
      }
    }

    const isInfo = v.tracking_mode === "info";
    if (!isInfo && !v.next_due_date) {
      ctx.addIssue({ code: "custom", path: ["next_due_date"], message: "Enter the next due date" });
    }
    if (!isInfo && v.end_date && v.next_due_date && v.end_date < v.next_due_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "The last payment can't be before the next due date" });
    }

    return {
      name: v.name,
      kind: v.kind,
      subtype: v.subtype,
      tracking_mode: v.tracking_mode,
      amount_paise,
      amount_is_estimate: v.amount_is_estimate,
      // Info-only items have no payment schedule (database rule).
      frequency: isInfo ? ("one_time" as const) : v.frequency,
      next_due_date: isInfo ? null : v.next_due_date,
      end_date: isInfo || v.frequency === "one_time" ? null : v.end_date,
      maturity_date: v.maturity_date,
      provider: v.provider,
      // Cover is display-only and only meaningful for insurance.
      coverage_paise: v.kind === "insurance" ? coverage_paise : null,
      notes: v.notes,
    };
  });

export type CommitmentInput = z.output<typeof commitmentSchema>;

export function commitmentFormValues(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    kind: String(formData.get("kind") ?? ""),
    subtype: String(formData.get("subtype") ?? ""),
    tracking_mode: String(formData.get("tracking_mode") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    amount_is_estimate: formData.get("amount_is_estimate") === "on",
    frequency: String(formData.get("frequency") ?? ""),
    next_due_date: String(formData.get("next_due_date") ?? ""),
    end_date: String(formData.get("end_date") ?? ""),
    maturity_date: String(formData.get("maturity_date") ?? ""),
    provider: String(formData.get("provider") ?? ""),
    coverage: String(formData.get("coverage") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}

export type FieldErrors = Partial<Record<string, string>>;

export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

// Settings
export const settingsSchema = z
  .object({
    display_name: z.string().trim().max(80, "Keep your name under 80 characters"),
    income: z.string().trim(),
    budget: z.string().trim(),
    payday_day: z.coerce.number().int("Choose a day from 1 to 31").min(1, "Choose a day from 1 to 31").max(31, "Choose a day from 1 to 31"),
  })
  .transform((v, ctx) => {
    const income = parseRupees(v.income);
    const budget = parseRupees(v.budget);
    if (income === null) ctx.addIssue({ code: "custom", path: ["income"], message: "Enter your monthly take-home pay, like 80000" });
    if (budget === null) ctx.addIssue({ code: "custom", path: ["budget"], message: "Enter a budget, like 20000 (0 is fine)" });
    if (income !== null && income > 10_000_000_000) ctx.addIssue({ code: "custom", path: ["income"], message: "That amount is too large" });
    if (budget !== null && budget > 10_000_000_000) ctx.addIssue({ code: "custom", path: ["budget"], message: "That amount is too large" });
    return {
      display_name: v.display_name === "" ? null : v.display_name,
      monthly_income_paise: income ?? 0,
      cycle_budget_paise: budget ?? 0,
      payday_day: v.payday_day,
    };
  });
