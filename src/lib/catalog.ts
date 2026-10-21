// Commitment types offered in the add flow, with their defaults, plus suggestion lists.
// Suggestions are examples to save typing, not a complete or live list: every field
// accepts any value the user types.
import type { CommitmentKind, Frequency, TrackingMode } from "./engine/types";

export type FormVariant = "bill" | "loan" | "card" | "insurance" | "subscription" | "sip" | "rd" | "fd" | "savings" | "other";

export interface CommitmentType {
  key: string;
  label: string;
  description: string;
  icon: string; // lucide icon name, mapped in components/icons.tsx
  variant: FormVariant;
  kind: CommitmentKind;
  subtype: string;
  frequency: Frequency;
  mode: TrackingMode;
  name: string;
  estimate?: boolean;
}

export const COMMITMENT_TYPES: CommitmentType[] = [
  { key: "rent", label: "Rent", description: "House rent or maintenance", icon: "home", variant: "bill", kind: "bill", subtype: "rent", frequency: "monthly", mode: "outflow", name: "Rent" },
  { key: "bill", label: "Bills", description: "Electricity, water, gas, internet, mobile", icon: "zap", variant: "bill", kind: "bill", subtype: "electricity", frequency: "monthly", mode: "outflow", name: "Electricity", estimate: true },
  { key: "emi", label: "Loan EMI", description: "Home, vehicle, personal or education loan", icon: "landmark", variant: "loan", kind: "loan", subtype: "home_loan", frequency: "monthly", mode: "outflow", name: "Loan EMI" },
  { key: "card", label: "Credit card", description: "Card bill due date and amount", icon: "credit-card", variant: "card", kind: "credit_card", subtype: "credit_card", frequency: "monthly", mode: "reminder", name: "" },
  { key: "insurance", label: "Insurance", description: "Health, life or vehicle premium", icon: "shield", variant: "insurance", kind: "insurance", subtype: "health", frequency: "yearly", mode: "outflow", name: "Health insurance" },
  { key: "subscription", label: "Subscription", description: "Streaming, music, apps, gym", icon: "repeat", variant: "subscription", kind: "subscription", subtype: "ott", frequency: "monthly", mode: "outflow", name: "" },
  { key: "sip", label: "SIP", description: "Mutual fund SIP contribution", icon: "trending-up", variant: "sip", kind: "investment", subtype: "sip", frequency: "monthly", mode: "outflow", name: "SIP" },
  { key: "rd", label: "Recurring deposit", description: "Monthly RD instalment", icon: "piggy-bank", variant: "rd", kind: "investment", subtype: "rd", frequency: "monthly", mode: "outflow", name: "Recurring deposit" },
  { key: "fd", label: "Fixed deposit", description: "FD principal and maturity date", icon: "vault", variant: "fd", kind: "investment", subtype: "fd", frequency: "one_time", mode: "info", name: "Fixed deposit" },
  { key: "savings", label: "PPF / EPF", description: "PPF contributions or EPF record", icon: "wallet", variant: "savings", kind: "investment", subtype: "ppf", frequency: "yearly", mode: "outflow", name: "PPF" },
  { key: "other", label: "Other", description: "Fees, repayments or anything else", icon: "circle-ellipsis", variant: "other", kind: "other", subtype: "other", frequency: "monthly", mode: "outflow", name: "" },
];

export function typeByKey(key: string | undefined): CommitmentType | undefined {
  return COMMITMENT_TYPES.find((t) => t.key === key);
}

// Picks the form variant for an existing commitment.
export function variantFor(kind: CommitmentKind, subtype: string): FormVariant {
  switch (kind) {
    case "bill":
      return "bill";
    case "loan":
      return "loan";
    case "credit_card":
      return "card";
    case "insurance":
      return "insurance";
    case "subscription":
      return "subscription";
    case "investment":
      return subtype === "sip" ? "sip" : subtype === "rd" ? "rd" : subtype === "fd" ? "fd" : "savings";
    default:
      return "other";
  }
}

export const CARD_ISSUERS: { name: string; variants: string[] }[] = [
  { name: "HDFC Bank", variants: ["Millennia", "Regalia Gold", "Infinia", "Diners Club Black", "Swiggy", "Tata Neu Infinity", "MoneyBack+"] },
  { name: "ICICI Bank", variants: ["Amazon Pay", "Coral", "Rubyx", "Sapphiro", "Emeralde", "HPCL Super Saver"] },
  { name: "SBI Card", variants: ["SimplyCLICK", "SimplySAVE", "Cashback", "PRIME", "ELITE", "BPCL Octane"] },
  { name: "Axis Bank", variants: ["ACE", "Flipkart", "Magnus", "Atlas", "Neo", "MY Zone"] },
  { name: "Kotak Mahindra Bank", variants: ["811 #Dream Different", "League Platinum", "Myntra", "White"] },
  { name: "American Express", variants: ["Membership Rewards", "Platinum Travel", "SmartEarn", "Gold Charge"] },
  { name: "IDFC FIRST Bank", variants: ["Millennia", "Classic", "Select", "Wealth"] },
  { name: "IndusInd Bank", variants: ["Legend", "Platinum", "EazyDiner"] },
  { name: "Yes Bank", variants: ["Prosperity", "Marquee", "Elite+"] },
  { name: "AU Small Finance Bank", variants: ["LIT", "Altura", "Zenith"] },
  { name: "RBL Bank", variants: ["Shoprite", "World Safari", "Platinum Maxima"] },
  { name: "HSBC", variants: ["Live+", "Premier", "Visa Platinum"] },
  { name: "Standard Chartered", variants: ["Smart", "EaseMyTrip", "Ultimate"] },
  { name: "Federal Bank", variants: ["Scapia", "OneCard", "Celesta"] },
];

export const INSURERS = [
  "Star Health",
  "HDFC ERGO",
  "ICICI Lombard",
  "Niva Bupa",
  "Care Health",
  "Bajaj Allianz",
  "Tata AIG",
  "Digit",
  "Acko",
  "LIC",
  "HDFC Life",
  "SBI Life",
  "ICICI Prudential Life",
  "Axis Max Life",
  "Tata AIA",
];

export const BANKS = [
  "SBI",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Bank of Baroda",
  "Punjab National Bank",
  "Canara Bank",
  "Union Bank of India",
  "IDFC FIRST Bank",
  "IndusInd Bank",
  "Yes Bank",
  "Post Office",
];

export const FUND_PLATFORMS = [
  "SBI Mutual Fund",
  "HDFC Mutual Fund",
  "ICICI Prudential Mutual Fund",
  "Nippon India Mutual Fund",
  "Axis Mutual Fund",
  "Kotak Mutual Fund",
  "Parag Parikh Mutual Fund",
  "Mirae Asset Mutual Fund",
  "UTI Mutual Fund",
  "Zerodha Coin",
  "Groww",
  "Kuvera",
];
