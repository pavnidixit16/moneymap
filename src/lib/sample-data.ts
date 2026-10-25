// Example records for testers and demos. Every row is marked is_sample so it can be
// shown with a "Sample" badge and removed in one step. Dates are placed relative to
// today and the user's pay cycle so the dashboard always has something to show.
import { payCycle } from "./engine/cycle";
import { addDays, maxDate, type ISODate } from "./engine/dates";

const r = (rupees: number) => rupees * 100;

// Example pay and budget, shown (never saved) while someone explores with sample data
// before entering their own. Their real settings stay untouched.
export const SAMPLE_PAY = { monthly_income_paise: r(100000), cycle_budget_paise: r(35000) };

export function previewProfile<P extends { onboarded_at: string | null; monthly_income_paise: number; cycle_budget_paise: number }>(
  profile: P,
  sampleLoaded: boolean,
): { profile: P; preview: boolean } {
  if (profile.onboarded_at || !sampleLoaded) return { profile, preview: false };
  return { profile: { ...profile, ...SAMPLE_PAY, onboarded_at: "sample-preview" }, preview: true };
}

export function sampleRows(today: ISODate, paydayDay: number) {
  const cycle = payCycle(paydayDay, today);
  // A due date inside the current cycle, never before today.
  const inCycle = (offset: number) => {
    const d = addDays(today, offset);
    return d <= cycle.end ? d : cycle.end;
  };
  const day = (iso: ISODate) => Number(iso.slice(8));

  const commitments = [
    { name: "House rent", kind: "bill", subtype: "rent", provider: "Landlord", tracking_mode: "outflow", amount_paise: r(22000), frequency: "monthly", next_due_date: inCycle(3) },
    { name: "Electricity", kind: "bill", subtype: "electricity", provider: "BESCOM", tracking_mode: "outflow", amount_paise: r(1800), amount_is_estimate: true, frequency: "monthly", next_due_date: inCycle(5) },
    { name: "Car loan EMI", kind: "loan", subtype: "vehicle_loan", provider: "HDFC Bank", tracking_mode: "outflow", amount_paise: r(9500), frequency: "monthly", next_due_date: addDays(cycle.end, 10) },
    { name: "HDFC Millennia", kind: "credit_card", subtype: "credit_card", provider: "HDFC Bank", tracking_mode: "reminder", amount_paise: r(14000), frequency: "monthly", next_due_date: inCycle(6) },
    { name: "Family health cover", kind: "insurance", subtype: "health", provider: "Star Health", tracking_mode: "outflow", amount_paise: r(24000), coverage_paise: r(1000000), frequency: "yearly", next_due_date: addDays(today, 45) },
    { name: "Netflix", kind: "subscription", subtype: "ott", tracking_mode: "outflow", amount_paise: r(649), frequency: "monthly", next_due_date: inCycle(4) },
    { name: "Spotify", kind: "subscription", subtype: "music", tracking_mode: "outflow", amount_paise: r(119), frequency: "monthly", next_due_date: addDays(today, 12) },
    { name: "Gym membership", kind: "subscription", subtype: "gym", tracking_mode: "outflow", amount_paise: r(4500), frequency: "quarterly", next_due_date: addDays(today, 20) },
    { name: "Nifty 50 index fund", kind: "investment", subtype: "sip", provider: "Groww", tracking_mode: "outflow", amount_paise: r(5000), frequency: "monthly", next_due_date: inCycle(2) },
    { name: "SBI recurring deposit", kind: "investment", subtype: "rd", provider: "SBI", tracking_mode: "outflow", amount_paise: r(2000), frequency: "monthly", next_due_date: addDays(cycle.end, 5), maturity_date: addDays(today, 400) },
    { name: "SBI fixed deposit", kind: "investment", subtype: "fd", provider: "SBI", tracking_mode: "info", amount_paise: r(100000), frequency: "one_time", next_due_date: null, maturity_date: addDays(today, 40) },
  ].map((c) => ({
    amount_is_estimate: false,
    coverage_paise: null,
    maturity_date: null,
    ...c,
    anchor_day: c.next_due_date && c.frequency !== "weekly" && c.frequency !== "one_time" ? day(c.next_due_date) : null,
    notes: "Sample data",
    is_sample: true,
  }));

  const spent = (offset: number) => maxDate(cycle.start, addDays(today, -offset));
  const transactions = [
    { kind: "expense", amount_paise: r(4200), category: "groceries", occurred_on: spent(6), note: "Weekly groceries" },
    { kind: "expense", amount_paise: r(2350), category: "food", occurred_on: spent(4), note: "Dinner out" },
    { kind: "expense", amount_paise: r(1480), category: "transport", occurred_on: spent(3), note: "Cab rides" },
    { kind: "expense", amount_paise: r(3199), category: "shopping", occurred_on: spent(2), note: "Shoes" },
    { kind: "expense", amount_paise: r(650), category: "entertainment", occurred_on: spent(1), note: "Movie" },
    { kind: "income", amount_paise: r(5000), category: "income", occurred_on: spent(5), note: "Freelance payment" },
  ].map((t) => ({ ...t, source: "sample", is_sample: true }));

  return { commitments, transactions };
}
