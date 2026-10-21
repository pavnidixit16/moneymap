// Pay-cycle calculations R1–R10 from docs/SPEC.md §7. Pure functions: same input, same
// output, no database or clock access, so every rule can be unit-tested.
import { addDays, type ISODate } from "./dates";
import { payCycle, type PayCycle } from "./cycle";
import { OCCURRENCES_PER_YEAR, projectOccurrences } from "./schedule";
import type { Commitment, Paise, Payment, Profile, Transaction } from "./types";

export type Bucket = "obligation" | "investment" | "reminder";
export type OccurrenceState = "overdue" | "due_today" | "upcoming";

export interface DueItem {
  commitmentId: string;
  name: string;
  kind: Commitment["kind"];
  subtype: string;
  date: ISODate;
  amountPaise: Paise;
  isEstimate: boolean;
  bucket: Bucket;
  state: OccurrenceState;
}

export interface DateEvent {
  commitmentId: string;
  name: string;
  date: ISODate;
  type: "maturity" | "renewal";
}

export interface Overview {
  today: ISODate;
  cycle: PayCycle;
  incomeBasePaise: Paise;
  incomeExtraPaise: Paise;
  incomePaise: Paise; // R1
  spendingPaise: Paise; // R2
  spendingByCategory: { category: string; paise: Paise }[];
  budgetPaise: Paise;
  budgetLeftPaise: Paise; // R3
  obligationsPaidPaise: Paise; // R4
  investmentsPaidPaise: Paise; // R5
  obligationsDuePaise: Paise; // R6
  investmentsDuePaise: Paise; // R7
  remainingPaise: Paise; // R8
  plannedInvestmentsPaise: Paise; // R9
  dueItems: DueItem[]; // counted and reminder-only items due up to the end of the cycle
  overdueCount: number;
  overduePaise: Paise;
  includesEstimates: boolean;
  commitmentsExceedBudget: boolean;
}

export interface EngineInput {
  profile: Profile;
  transactions: Transaction[];
  commitments: Commitment[];
  payments: Payment[];
  today: ISODate;
}

export function bucketOf(c: Pick<Commitment, "kind" | "tracking_mode">): Bucket | null {
  if (c.tracking_mode === "info") return null;
  if (c.tracking_mode === "reminder") return "reminder";
  return c.kind === "investment" ? "investment" : "obligation";
}

export function stateOf(date: ISODate, today: ISODate): OccurrenceState {
  if (date < today) return "overdue";
  return date === today ? "due_today" : "upcoming";
}

function resolvedDatesByCommitment(payments: Payment[]): Map<string, Set<ISODate>> {
  const map = new Map<string, Set<ISODate>>();
  for (const p of payments) {
    if (!map.has(p.commitment_id)) map.set(p.commitment_id, new Set());
    map.get(p.commitment_id)!.add(p.due_date);
  }
  return map;
}

// Unresolved due dates of active, non-info commitments up to `until`, oldest first.
export function dueItemsUntil(
  commitments: Commitment[],
  payments: Payment[],
  today: ISODate,
  until: ISODate,
): DueItem[] {
  const resolved = resolvedDatesByCommitment(payments);
  const items: DueItem[] = [];
  for (const c of commitments) {
    const bucket = bucketOf(c);
    if (c.status !== "active" || !bucket) continue;
    for (const date of projectOccurrences(c, until, resolved.get(c.id))) {
      items.push({
        commitmentId: c.id,
        name: c.name,
        kind: c.kind,
        subtype: c.subtype,
        date,
        amountPaise: c.amount_paise,
        isEstimate: c.amount_is_estimate,
        bucket,
        state: stateOf(date, today),
      });
    }
  }
  return items.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date < b.date ? -1 : 1));
}

const inRange = (date: ISODate | null, start: ISODate, end: ISODate) =>
  date !== null && date >= start && date <= end;

export function computeOverview({ profile, transactions, commitments, payments, today }: EngineInput): Overview {
  const cycle = payCycle(profile.payday_day, today);
  const inCycle = (date: ISODate | null) => inRange(date, cycle.start, cycle.end);

  // R1, R2
  let incomeExtraPaise = 0;
  let spendingPaise = 0;
  const byCategory = new Map<string, Paise>();
  for (const t of transactions) {
    if (!inCycle(t.occurred_on)) continue;
    if (t.kind === "income") {
      incomeExtraPaise += t.amount_paise;
    } else {
      spendingPaise += t.amount_paise;
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount_paise);
    }
  }
  const incomePaise = profile.monthly_income_paise + incomeExtraPaise;

  // R4, R5: payments count in the cycle they were paid (D4), whatever their due date.
  const commitmentById = new Map(commitments.map((c) => [c.id, c]));
  let obligationsPaidPaise = 0;
  let investmentsPaidPaise = 0;
  for (const p of payments) {
    if (p.outcome !== "paid" || !inCycle(p.paid_on)) continue;
    const c = commitmentById.get(p.commitment_id);
    const bucket = c ? bucketOf(c) : null;
    if (bucket === "obligation") obligationsPaidPaise += p.amount_paise;
    if (bucket === "investment") investmentsPaidPaise += p.amount_paise;
  }

  // R6, R7: everything still unresolved up to the end of the cycle, including overdue
  // dates from earlier cycles.
  const dueItems = dueItemsUntil(commitments, payments, today, cycle.end);
  let obligationsDuePaise = 0;
  let investmentsDuePaise = 0;
  let overdueCount = 0;
  let overduePaise = 0;
  let includesEstimates = false;
  for (const item of dueItems) {
    if (item.bucket === "reminder") continue;
    if (item.bucket === "obligation") obligationsDuePaise += item.amountPaise;
    else investmentsDuePaise += item.amountPaise;
    if (item.state === "overdue") {
      overdueCount += 1;
      overduePaise += item.amountPaise;
    }
    if (item.isEstimate) includesEstimates = true;
  }

  const budgetLeftPaise = profile.cycle_budget_paise - spendingPaise;
  const remainingPaise =
    incomePaise - spendingPaise - obligationsPaidPaise - investmentsPaidPaise - obligationsDuePaise - investmentsDuePaise;

  return {
    today,
    cycle,
    incomeBasePaise: profile.monthly_income_paise,
    incomeExtraPaise,
    incomePaise,
    spendingPaise,
    spendingByCategory: [...byCategory].map(([category, paise]) => ({ category, paise })).sort((a, b) => b.paise - a.paise),
    budgetPaise: profile.cycle_budget_paise,
    budgetLeftPaise,
    obligationsPaidPaise,
    investmentsPaidPaise,
    obligationsDuePaise,
    investmentsDuePaise,
    remainingPaise,
    plannedInvestmentsPaise: investmentsPaidPaise + investmentsDuePaise,
    dueItems,
    overdueCount,
    overduePaise,
    includesEstimates,
    commitmentsExceedBudget: remainingPaise < budgetLeftPaise,
  };
}

// Maturities of any non-cancelled item and due dates of active insurance policies in the
// next `days` days ("Coming up" on the overview).
export function comingUp(commitments: Commitment[], payments: Payment[], today: ISODate, days = 60): DateEvent[] {
  const until = addDays(today, days);
  const events: DateEvent[] = [];
  for (const c of commitments) {
    if (c.status !== "cancelled" && inRange(c.maturity_date, today, until)) {
      events.push({ commitmentId: c.id, name: c.name, date: c.maturity_date!, type: "maturity" });
    }
  }
  const renewals = dueItemsUntil(
    commitments.filter((c) => c.kind === "insurance"),
    payments,
    today,
    until,
  ).filter((item) => item.date >= today);
  for (const r of renewals) {
    events.push({ commitmentId: r.commitmentId, name: r.name, date: r.date, type: "renewal" });
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// R10: subscription equivalents. Yearly = amount × occurrences per year (exact); monthly =
// yearly ÷ 12, rounded to the paisa.
export function subscriptionCosts(c: Pick<Commitment, "amount_paise" | "frequency">): {
  monthlyPaise: Paise;
  yearlyPaise: Paise;
} {
  const yearlyPaise = c.amount_paise * OCCURRENCES_PER_YEAR[c.frequency];
  return { monthlyPaise: Math.round(yearlyPaise / 12), yearlyPaise };
}
