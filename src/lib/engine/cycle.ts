import { addDays, clampedDate, parseISODate, type ISODate } from "./dates";

export interface PayCycle {
  start: ISODate;
  end: ISODate;
  nextPayday: ISODate;
}

function paydayIn(y: number, m: number, paydayDay: number): ISODate {
  return clampedDate(y, m, paydayDay);
}

// The pay cycle containing `today`: from the latest payday on or before today up to the
// day before the next payday. Paydays past the month's end fall on its last day.
export function payCycle(paydayDay: number, today: ISODate): PayCycle {
  const { y, m } = parseISODate(today);
  const thisMonth = paydayIn(y, m, paydayDay);

  const [startY, startM] = thisMonth <= today ? [y, m] : m === 1 ? [y - 1, 12] : [y, m - 1];
  const start = paydayIn(startY, startM, paydayDay);
  const [nextY, nextM] = startM === 12 ? [startY + 1, 1] : [startY, startM + 1];
  const nextPayday = paydayIn(nextY, nextM, paydayDay);

  return { start, end: addDays(nextPayday, -1), nextPayday };
}
