// The guest demo: a complete, fictional MoneyMap month built in memory from the same sample
// fixtures as "Explore with sample data", dated from today. It never touches the database:
// no account, no session, no row is read or written, so visitors need no sign-in and real
// users' data cannot be reached or changed. Pages run it through the real calculation
// engine (computeOverview, dueItemsUntil), exactly as for a signed-in user.
import type { CommitmentRow, PaymentRow, ProfileRow, TransactionRow } from "./data";
import type { ISODate } from "./engine/dates";
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
