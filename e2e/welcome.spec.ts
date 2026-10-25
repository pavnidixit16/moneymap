import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { sessionCookie, USERS } from "./local/session";

async function signIn(page: Page) {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...sessionCookie("w"), domain: "localhost", path: "/" }]);
}
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}
const sql = (query: string) =>
  execFileSync("psql", ["-h", process.env.PGHOST!, "-p", process.env.PGPORT!, "-U", "postgres", "-d", "mm_e2e", "-v", "ON_ERROR_STOP=1", "-tAc", query]).toString().trim();
const profile = () =>
  sql(`select monthly_income_paise || '/' || cycle_budget_paise || '/' || coalesce(onboarded_at::text, 'none') from public.profiles where id = '${USERS.w.id}'`);

test("a first-time visitor sees how it works and can explore with sample data, without changing their settings", async ({ page }) => {
  await signIn(page);
  await open(page, "/overview");
  await expect(page.getByText("Welcome, Wren")).toBeVisible();
  const how = page.getByRole("region", { name: "How it works" });
  await expect(how.getByRole("listitem")).toHaveCount(3);
  await expect(how).toContainText("Your pay and payday");
  await expect(how).toContainText("not your bank balance");
  await expect(page.getByRole("link", { name: "Set up MoneyMap" })).toBeVisible();

  await page.getByRole("button", { name: "Explore with sample data first" }).click();
  await expect(page.getByRole("note")).toContainText("You're exploring with sample data.");
  await expect(page.getByText("Estimated amount remaining after recorded spending and commitments")).toBeVisible();
  await expect(page.getByText("House rent").first()).toBeVisible();
  expect(profile()).toBe("0/0/none"); // example pay is shown, never saved
  // Exploring never creates streaks, achievements or real entries.
  expect(sql(`select (select count(*) from public.daily_checkins where user_id = '${USERS.w.id}') || '/' || (select count(*) from public.achievements where user_id = '${USERS.w.id}') || '/' || (select count(*) from public.transactions where user_id = '${USERS.w.id}' and not is_sample)`)).toBe("0/0/0");
  await expect(page.getByText("Welcome to your MoneyMap demo")).toBeVisible();
  await expect(page.getByText(/^Hi, /)).toHaveCount(0);

  await open(page, "/afford");
  await expect(page.getByRole("note")).toContainText("example pay");
  await page.getByLabel("How much is it? (₹)").fill("2000");
  await expect(page.getByRole("region", { name: "Estimate" })).not.toContainText("We need a little more information");

  // Clearing the sample brings back the welcome screen.
  await open(page, "/settings");
  await page.getByRole("button", { name: "Clear sample data" }).click();
  await expect(page.getByText(/Sample data removed/)).toBeVisible();
  await open(page, "/overview");
  await expect(page.getByRole("button", { name: "Explore with sample data first" })).toBeVisible();
  expect(profile()).toBe("0/0/none");
});

test("the welcome screen fits a 360px phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page);
  await open(page, "/overview");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/welcome-360.png`, fullPage: true });
});

// Everything real for a user, as one comparable string: entries, commitments, payments,
// streak data, achievements and settings.
const realSnapshot = (id: string) =>
  sql(`select concat_ws(' | ',
    (select coalesce(string_agg(concat_ws(',', kind, amount_paise, category, occurred_on, source), ';' order by id), '') from public.transactions where user_id = '${id}' and not is_sample),
    (select coalesce(string_agg(concat_ws(',', name, amount_paise, tracking_mode, next_due_date, status), ';' order by id), '') from public.commitments where user_id = '${id}' and not is_sample),
    (select coalesce(string_agg(concat_ws(',', p.due_date, p.amount_paise, p.paid_on), ';' order by p.id), '') from public.commitment_payments p join public.commitments c on c.id = p.commitment_id where p.user_id = '${id}' and not c.is_sample),
    (select coalesce(string_agg(concat_ws(',', local_date, kind, status), ';' order by local_date), '') from public.daily_checkins where user_id = '${id}'),
    (select coalesce(string_agg(key, ';' order by key), '') from public.achievements where user_id = '${id}'),
    (select concat_ws(',', monthly_income_paise, cycle_budget_paise, payday_day) from public.profiles where id = '${id}'))`);

test("a set-up user: sample data is labelled in their figures, and clearing it leaves every real record untouched", async ({ page }) => {
  const id = USERS.u.id; // set up, with real commitments, spending and an early payment
  const before = realSnapshot(id);
  expect(before).toContain("Rent");
  await page.context().clearCookies();
  await page.context().addCookies([{ ...sessionCookie("u"), domain: "localhost", path: "/" }]);

  await open(page, "/settings");
  await page.getByRole("button", { name: "Load sample data" }).click();
  await expect(page.getByText(/Sample data loaded/)).toBeVisible();
  await open(page, "/overview");
  await expect(page.getByRole("note")).toContainText("Sample items are included in these figures");
  await expect(page.getByText("Welcome to your MoneyMap demo")).toHaveCount(0); // real users keep their greeting
  expect(realSnapshot(id)).toBe(before); // loading sample data changed nothing real

  // A payment recorded against a sample bill goes away with the sample.
  sql(`insert into public.commitment_payments (user_id, commitment_id, due_date, outcome, amount_paise, paid_on)
       select user_id, id, next_due_date, 'paid', amount_paise, (now() at time zone 'Asia/Kolkata')::date
       from public.commitments where user_id = '${id}' and is_sample and name = 'Netflix'`);

  await open(page, "/settings");
  await page.getByRole("button", { name: "Clear sample data" }).click();
  await expect(page.getByText(/Sample data removed/)).toBeVisible();
  expect(sql(`select (select count(*) from public.commitments where user_id = '${id}' and is_sample) + (select count(*) from public.transactions where user_id = '${id}' and is_sample)`)).toBe("0");
  expect(sql(`select count(*) from public.commitment_payments p where p.user_id = '${id}' and not exists (select 1 from public.commitments c where c.id = p.commitment_id)`)).toBe("0");
  expect(realSnapshot(id)).toBe(before); // clearing touched nothing real

  await open(page, "/overview");
  await expect(page.getByRole("note")).toHaveCount(0);
});

test("demo dashboard at iPhone width: greeting, banner and figures", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await open(page, "/overview");
  await page.getByRole("button", { name: "Explore with sample data first" }).click();
  await expect(page.getByText("Welcome to your MoneyMap demo")).toBeVisible();
  await expect(page.getByRole("note")).toContainText("You're exploring with sample data.");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  if (process.env.SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/demo-390.png` });
    await page.getByText("How is this calculated?").click();
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/demo-390-breakdown.png`, fullPage: true });
  }
});
