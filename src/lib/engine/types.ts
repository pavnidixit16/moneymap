import type { ISODate } from "./dates";

// Money is always integer paise (₹1 = 100 paise) to avoid floating-point errors.
export type Paise = number;

export const FREQUENCIES = ["one_time", "weekly", "monthly", "quarterly", "half_yearly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const COMMITMENT_KINDS = [
  "bill",
  "loan",
  "credit_card",
  "insurance",
  "subscription",
  "investment",
  "other",
] as const;
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number];

export const TRACKING_MODES = ["outflow", "reminder", "info"] as const;
export type TrackingMode = (typeof TRACKING_MODES)[number];

export type CommitmentStatus = "active" | "cancelled" | "ended";
export type ReviewStatus = "unreviewed" | "keep" | "review";
export type PaymentOutcome = "paid" | "skipped" | "paid_unrecorded";

export interface Profile {
  monthly_income_paise: Paise;
  cycle_budget_paise: Paise;
  payday_day: number;
}

export interface Transaction {
  id: string;
  kind: "expense" | "income";
  amount_paise: Paise;
  category: string;
  occurred_on: ISODate;
}

export interface Commitment {
  id: string;
  name: string;
  kind: CommitmentKind;
  subtype: string;
  tracking_mode: TrackingMode;
  amount_paise: Paise;
  amount_is_estimate: boolean;
  frequency: Frequency;
  anchor_day: number | null;
  next_due_date: ISODate | null;
  end_date: ISODate | null;
  maturity_date: ISODate | null;
  status: CommitmentStatus;
  review_status: ReviewStatus;
}

export interface Payment {
  id: string;
  commitment_id: string;
  due_date: ISODate;
  outcome: PaymentOutcome;
  amount_paise: Paise;
  paid_on: ISODate | null;
}
