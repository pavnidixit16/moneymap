// Loads the guest demo for this request: today's date in India, sample records built in
// memory. Server only; never reads cookies or the database.
import { connection } from "next/server";
import { payCycle } from "./engine/cycle";
import { istToday } from "./engine/dates";
import { DEMO_PAYDAY, guestDemo } from "./demo-data";

export async function loadGuestDemo() {
  await connection(); // dates depend on the request time
  const today = istToday();
  const demo = guestDemo(today);
  const cycle = payCycle(DEMO_PAYDAY, today);
  const cycleTransactions = demo.transactions.filter((t) => t.occurred_on >= cycle.start && t.occurred_on <= cycle.end);
  return { ...demo, today, cycle, cycleTransactions };
}
