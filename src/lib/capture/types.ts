// The one shape every input source produces. Sources only *propose* transactions; the
// shared review → confirm → save path (src/app/(app)/spending/smart) is the only way a
// proposal becomes a saved transaction.
import type { ISODate } from "../engine/dates";

export const SOURCES = ["text", "voice", "document", "gmail", "sms", "bank"] as const;
export type CaptureSource = (typeof SOURCES)[number];

export const PAYMENT_METHODS = ["upi", "debit_card", "credit_card", "cash", "net_banking", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type ProposalField = "amount" | "date" | "category" | "description" | "kind";

export interface ProposalIssue {
  field: ProposalField;
  // Shown to the user next to the field, e.g. "Date not mentioned; assumed today".
  message: string;
}

export interface ProposedTransaction {
  source: CaptureSource;
  // Stable reference from the source (e.g. statement-row fingerprint). Re-importing the
  // same reference is rejected by a database constraint.
  sourceRef: string | null;
  kind: "expense" | "income";
  amountPaise: number | null;
  description: string;
  category: string | null;
  occurredOn: ISODate | null;
  paymentMethod: PaymentMethod | null;
  // Anything uncertain or missing; the review screen marks these "Needs review".
  issues: ProposalIssue[];
  // Special cases the review screen must handle instead of saving an ordinary expense.
  flags: {
    cardBillPayment?: boolean; // paying a credit-card bill: record it under Commitments
    subscriptionHint?: { name: string; frequency: "monthly" | "yearly" | "quarterly" | "weekly" };
  };
  // What the source saw, kept for the user's reference (never parsed again).
  raw: string;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  debit_card: "Debit card",
  credit_card: "Credit card",
  cash: "Cash",
  net_banking: "Net banking",
  other: "Other",
};

export const SOURCE_LABELS: Record<CaptureSource | "manual" | "sample", string> = {
  manual: "Entered manually",
  sample: "Sample data",
  text: "Typed or pasted text",
  voice: "Voice",
  document: "Uploaded statement",
  gmail: "Gmail",
  sms: "SMS",
  bank: "Bank account",
};
