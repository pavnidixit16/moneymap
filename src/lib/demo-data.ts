// The guest demo: a complete, fictional MoneyMap month built in memory from the same sample
// fixtures as "Explore with sample data", dated from today. It never touches the database:
// no account, no session, no row is read or written, so visitors need no sign-in and real
// users' data cannot be reached or changed. Pages run it through the real calculation
// engine (computeOverview, dueItemsUntil), exactly as for a signed-in user.
import type { CommitmentRow, PaymentRow, ProfileRow, TransactionRow } from "./data";
import type { ISODate } from "./engine/dates";
import type { Commitment, Profile, Transaction } from "./engine/types";
import { sampleRows, SAMPLE_PAY } from "./sample-data";

export const DEMO_PAYDAY = 1;

export interface GuestDemo {
  profile: ProfileRow;
  commitments: CommitmentRow[];
  payments: PaymentRow[];
  transactions: TransactionRow[]; // newest first, like listTransactions
}

export function guestDemo(today: ISODate): GuestDemo {
  const rows = sampleRows(today, DEMO_PAYDAY);
  const commitments = rows.commitments
    .map(
      (c, i): CommitmentRow => ({
        id: `demo-c${i + 1}`,
        name: c.name,
        kind: c.kind as CommitmentRow["kind"],
        subtype: c.subtype,
        tracking_mode: c.tracking_mode as CommitmentRow["tracking_mode"],
        amount_paise: c.amount_paise,
        amount_is_estimate: c.amount_is_estimate,
        frequency: c.frequency as CommitmentRow["frequency"],
        anchor_day: c.anchor_day,
        next_due_date: c.next_due_date,
        end_date: null,
        maturity_date: c.maturity_date,
        status: "active",
        review_status: "unreviewed",
        notes: null,
        provider: c.provider ?? null,
        coverage_paise: c.coverage_paise,
        is_sample: true,
        interest_rate_bps: null,
        previous_amount_paise: null,
        amount_changed_on: null,
        schedule_updated_at: `${today}T00:00:00Z`,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const transactions = rows.transactions
    .map(
      (t, i): TransactionRow => ({
        id: `demo-t${i + 1}`,
        kind: t.kind as TransactionRow["kind"],
        amount_paise: t.amount_paise,
        category: t.category,
        occurred_on: t.occurred_on,
        note: t.note,
        is_sample: true,
        payment_method: null,
        source: "sample",
      }),
    )
    .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : 0));
  return {
    profile: {
      id: "guest-demo",
      display_name: null,
      ...SAMPLE_PAY,
      payday_day: DEMO_PAYDAY,
      onboarded_at: "guest-demo",
    },
    commitments,
    payments: [],
    transactions,
  };
}

// ---------------------------------------------------------------------------------------
// The guided demo journey (what /demo shows): your pay → what's already committed → money
// left until payday. A small, realistic starting set the visitor can add to or remove from;
// everything lives in their browser tab and is recalculated by the real engine.
// ---------------------------------------------------------------------------------------

const CORE = ["House rent", "Car loan EMI", "Nifty 50 index fund", "Electricity", "Netflix", "HDFC Millennia"];

export interface DemoJourneyStart {
  today: ISODate;
  profile: Profile;
  commitments: Commitment[];
  spending: Transaction[]; // everyday spending already recorded this cycle (fixed in the demo)
}

export function demoJourneyStart(today: ISODate): DemoJourneyStart {
  const d = guestDemo(today);
  return {
    today,
    profile: { monthly_income_paise: d.profile.monthly_income_paise, cycle_budget_paise: d.profile.cycle_budget_paise, payday_day: DEMO_PAYDAY },
    commitments: CORE.map((name) => d.commitments.find((c) => c.name === name)!).map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      subtype: c.subtype,
      tracking_mode: c.tracking_mode,
      amount_paise: c.amount_paise,
      amount_is_estimate: c.amount_is_estimate,
      frequency: c.frequency,
      anchor_day: c.anchor_day,
      next_due_date: c.next_due_date,
      end_date: null,
      maturity_date: null,
      status: "active",
      review_status: "unreviewed",
    })),
    spending: d.transactions
      .filter((t) => t.kind === "expense")
      .map((t) => ({ id: t.id, kind: t.kind, amount_paise: t.amount_paise, category: t.category, occurred_on: t.occurred_on })),
  };
}

// What a visitor can add in the demo. A credit card is reminder-only by default: its
// purchases are already in everyday spending, so its bill is never counted again.
export const DEMO_TYPES = [
  { key: "rent", label: "Rent", kind: "bill", subtype: "rent", mode: "outflow" },
  { key: "emi", label: "Loan EMI", kind: "loan", subtype: "personal_loan", mode: "outflow" },
  { key: "sip", label: "SIP", kind: "investment", subtype: "sip", mode: "outflow" },
  { key: "bill", label: "Bill", kind: "bill", subtype: "electricity", mode: "outflow" },
  { key: "subscription", label: "Subscription", kind: "subscription", subtype: "ott", mode: "outflow" },
  { key: "card", label: "Credit card bill (reminder)", kind: "credit_card", subtype: "credit_card", mode: "reminder" },
] as const;

export type DemoTypeKey = (typeof DEMO_TYPES)[number]["key"];

// A monthly commitment from the demo's "Add a commitment" form; null if a field is invalid.
export function newDemoCommitment(input: { type: DemoTypeKey; name: string; amountPaise: number | null; dueDate: string }, id: string): Commitment | null {
  const t = DEMO_TYPES.find((x) => x.key === input.type);
  const name = input.name.trim();
  if (!t || !name || name.length > 80 || !input.amountPaise || input.amountPaise <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return null;
  return {
    id,
    name,
    kind: t.kind,
    subtype: t.subtype,
    tracking_mode: t.mode,
    amount_paise: input.amountPaise,
    amount_is_estimate: false,
    frequency: "monthly",
    anchor_day: Number(input.dueDate.slice(8)),
    next_due_date: input.dueDate as ISODate,
    end_date: null,
    maturity_date: null,
    status: "active",
    review_status: "unreviewed",
  };
}
