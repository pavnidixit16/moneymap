// "Can I afford this?": a what-if over the existing estimate (R8). Pure and read-only: it
// never saves anything. It reuses the overview's own numbers, so commitments are counted
// exactly once, the same way the Home estimate counts them.
//
// Tone rules (product principle): calm, specific, never shaming; the user decides.
import type { ISODate } from "./dates";
import type { DueItem, Overview } from "./overview";
import type { Paise } from "./types";

export type AffordLevel = "comfortable" | "tight" | "short" | "incomplete";

export const MESSAGES: Record<Exclude<AffordLevel, "incomplete">, string> = {
  comfortable: "Looks manageable based on your recorded information.",
  tight: "This could make the rest of your month a little tighter. Want to explore your options?",
  short: "This may leave you short before payday. Let's see whether a different amount or timeline could work.",
};
// The same purchase after the next payday: a rough guide from today's records, never a promise.
export const AFTER_MESSAGES: Record<Exclude<AffordLevel, "incomplete">, string> = {
  comfortable: "After payday, this looks manageable based on your recorded information.",
  tight: "After payday, this could still make that month a little tighter.",
  short: "Even after payday, this may leave you short. A smaller amount or a longer plan could work better.",
};
export const INCOMPLETE_MESSAGE = "We need a little more information before we can estimate this.";
export const NOT_NOW = "Not now doesn't mean never.";

export interface AffordInput {
  overview: Overview;
  hasCommitments: boolean; // any active commitment recorded at all
  onboarded: boolean;
}

export interface Assessment {
  level: AffordLevel;
  message: string;
  amountPaise: Paise;
  beforePaise: Paise; // today's estimate (R8)
  afterPaise: Paise; // after this purchase
  cushionPaise: Paise; // what "comfortable" leaves room for: remaining budget, or 10% of income
  cushionReason: "budget" | "income_share";
  reasons: DueItem[]; // counted commitments still due before payday, largest first
  limitations: string[];
}

// Counted items only (reminder-only credit cards are not counted, so not listed).
const counted = (items: DueItem[]) => items.filter((i) => i.bucket !== "reminder");

function limitationsOf({ overview: o, hasCommitments }: AffordInput): string[] {
  const notes: string[] = [];
  if (!hasCommitments) notes.push("You haven't added regular payments like rent, EMIs or SIPs yet, so they aren't included.");
  if (o.includesEstimates) notes.push("Some upcoming bills use estimated amounts.");
  if (o.overdueCount > 0) notes.push(`${o.overdueCount} earlier payment${o.overdueCount === 1 ? " is" : "s are"} still marked unpaid and counted as due.`);
  if (o.budgetPaise === 0) notes.push("No spending budget is set, so everyday spending for the rest of the cycle isn't estimated.");
  notes.push("Spending you haven't recorded in MoneyMap isn't included. This is an estimate, not your bank balance.");
  return notes;
}

export function assessPurchase(input: AffordInput, amountPaise: Paise): Assessment {
  const o = input.overview;
  const reasons = [...counted(o.dueItems)].sort((a, b) => b.amountPaise - a.amountPaise).slice(0, 4);
  const cushionReason = o.budgetPaise > 0 ? "budget" : "income_share";
  // Room the user has planned for everyday spending until payday; without a budget, keep a
  // modest share of this cycle's income as breathing room.
  const cushionPaise = cushionReason === "budget" ? Math.max(0, o.budgetLeftPaise) : Math.round(o.incomePaise * 0.1);
  const afterPaise = o.remainingPaise - amountPaise;
  const base = { amountPaise, beforePaise: o.remainingPaise, afterPaise, cushionPaise, cushionReason, reasons, limitations: limitationsOf(input) } as const;

  // Without income we can't say anything confident.
  if (!input.onboarded || o.incomeBasePaise <= 0) return { ...base, level: "incomplete", message: INCOMPLETE_MESSAGE };
  const level: AffordLevel = afterPaise < 0 ? "short" : afterPaise < cushionPaise ? "tight" : "comfortable";
  return { ...base, level, message: MESSAGES[level] };
}

export interface NextCycleEstimate {
  from: ISODate;
  to: ISODate;
  incomePaise: Paise;
  commitmentsPaise: Paise; // counted items due in the next cycle
  everydayPaise: Paise; // the cycle budget, if set
  carryPaise: Paise; // a shortfall from this cycle (never a surplus: that may be spent)
  afterPaise: Paise;
  level: Exclude<AffordLevel, "incomplete">;
}

// The same purchase made after the next payday. `nextItems` are the due items of the next
// cycle (from dueItemsUntil); items due before payday stay in this cycle, so nothing is
// counted twice. A rough guide, never a promise.
export function assessAfterPayday(input: AffordInput, next: { items: DueItem[]; end: ISODate }, amountPaise: Paise): NextCycleEstimate | null {
  const o = input.overview;
  if (!input.onboarded || o.incomeBasePaise <= 0) return null;
  const from = o.cycle.nextPayday;
  const commitmentsPaise = counted(next.items)
    .filter((i) => i.date >= from && i.date <= next.end)
    .reduce((s, i) => s + i.amountPaise, 0);
  const everydayPaise = o.budgetPaise;
  const carryPaise = Math.min(0, o.remainingPaise);
  const remaining = o.incomeBasePaise - commitmentsPaise - everydayPaise + carryPaise;
  const afterPaise = remaining - amountPaise;
  const cushion = everydayPaise > 0 ? 0 : Math.round(o.incomeBasePaise * 0.1);
  return {
    from,
    to: next.end,
    incomePaise: o.incomeBasePaise,
    commitmentsPaise,
    everydayPaise,
    carryPaise,
    afterPaise,
    level: afterPaise < 0 ? "short" : afterPaise < cushion ? "tight" : "comfortable",
  };
}

// Spreading the amount over a few months, for a user-approved "Saving towards …" plan.
export const PLAN_MONTHS = [2, 3, 6] as const;
export const monthlyShare = (amountPaise: Paise, months: number) => Math.ceil(amountPaise / months / 100) * 100;
