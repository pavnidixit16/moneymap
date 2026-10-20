// Calendar dates as plain "YYYY-MM-DD" strings. Arithmetic runs in UTC on purpose: these
// are calendar days, not instants, so no local timezone may shift them. Comparing two
// ISO date strings with < and > gives chronological order.

export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseISODate(value: ISODate): { y: number; m: number; d: number } {
  const match = ISO_RE.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new Error(`Invalid date: ${value}`);
  return { y, m, d };
}

export function isISODate(value: string): boolean {
  try {
    parseISODate(value);
    return true;
  } catch {
    return false;
  }
}

export function toISODate(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// The given day of the month, moved to the month's last day when the month is shorter
// (day 31 in April -> 30 April; day 30 in February 2027 -> 28 February).
export function clampedDate(y: number, m: number, day: number): ISODate {
  return toISODate(y, m, Math.min(day, daysInMonth(y, m)));
}

export function addDays(date: ISODate, days: number): ISODate {
  const { y, m, d } = parseISODate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toISODate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// Moves `months` calendar months from `date`, landing on `anchorDay` (clamped). Using the
// anchor rather than the current day lets 31 Jan -> 28 Feb -> 31 Mar recover the 31st.
export function addMonthsAnchored(date: ISODate, months: number, anchorDay: number): ISODate {
  const { y, m } = parseISODate(date);
  const index = y * 12 + (m - 1) + months;
  return clampedDate(Math.floor(index / 12), (index % 12) + 1, anchorDay);
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

// Today's date in India for the given instant, independent of the device's timezone.
export function istToday(now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
