import { addDays, addMonthsAnchored, parseISODate, type ISODate } from "./dates";
import type { Commitment, Frequency } from "./types";

// Safety limit so a weekly item with a very old due date can never loop for ever.
export const MAX_PROJECTED = 120;

const MONTH_STEPS: Partial<Record<Frequency, number>> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

export function nextOccurrence(date: ISODate, frequency: Frequency, anchorDay: number | null): ISODate | null {
  if (frequency === "one_time") return null;
  if (frequency === "weekly") return addDays(date, 7);
  const months = MONTH_STEPS[frequency]!;
  return addMonthsAnchored(date, months, anchorDay ?? parseISODate(date).d);
}

type Schedule = Pick<Commitment, "frequency" | "anchor_day" | "next_due_date" | "end_date">;

// Unresolved due dates from next_due_date up to and including `until`, skipping dates
// that already have a payment record (paid, skipped or paid before tracking).
export function projectOccurrences(
  commitment: Schedule,
  until: ISODate,
  resolvedDates: ReadonlySet<ISODate> = new Set(),
): ISODate[] {
  const result: ISODate[] = [];
  let date = commitment.next_due_date;
  let steps = 0;

  while (date && date <= until && steps < MAX_PROJECTED) {
    if (commitment.end_date && date > commitment.end_date) break;
    if (!resolvedDates.has(date)) result.push(date);
    date = nextOccurrence(date, commitment.frequency, commitment.anchor_day);
    steps += 1;
  }
  return result;
}

// The schedule after `dueDate` is resolved: the earliest later unresolved date, or null
// (meaning the item has ended) when the schedule has no more dates.
export function nextUnresolvedAfter(
  commitment: Schedule,
  dueDate: ISODate,
  resolvedDates: ReadonlySet<ISODate>,
): ISODate | null {
  let date = nextOccurrence(dueDate, commitment.frequency, commitment.anchor_day);
  let steps = 0;
  while (date && steps < MAX_PROJECTED) {
    if (commitment.end_date && date > commitment.end_date) return null;
    if (!resolvedDates.has(date)) return date;
    date = nextOccurrence(date, commitment.frequency, commitment.anchor_day);
    steps += 1;
  }
  return null;
}

// Yearly occurrences, used for subscription equivalents.
export const OCCURRENCES_PER_YEAR: Record<Frequency, number> = {
  one_time: 0,
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  yearly: 1,
};
