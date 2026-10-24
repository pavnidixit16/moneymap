import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { sessionCookie, USERS } from "./local/session";

async function signIn(page: Page, user: keyof typeof USERS) {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/" }]);
}
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}
const estimate = (page: Page) => page.getByRole("region", { name: "Estimate" });
const records = (user: keyof typeof USERS) =>
  execFileSync("psql", ["-h", process.env.PGHOST!, "-p", process.env.PGPORT!, "-U", "postgres", "-d", "mm_e2e", "-tAc",
    `select (select count(*) from public.transactions where user_id = '${USERS[user].id}') || '/' || (select count(*) from public.commitments where user_id = '${USERS[user].id}') || '/' || (select count(*) from public.daily_checkins where user_id = '${USERS[user].id}')`]).toString().trim();
const SHAMING = /can't afford|cannot afford|bad spending|fail|waste|irresponsible|overspend/i;

test.describe.configure({ mode: "serial" });

test("from Home: a comfortable purchase, with the numbers behind it", async ({ page }) => {
  await signIn(page, "u");
  await open(page, "/overview");
  const before = records("u");
  await page.getByRole("link", { name: /Can I afford this\?/ }).click();
  await expect(page).toHaveURL(/\/afford$/);
  await page.getByLabel("How much is it? (₹)").fill("6000");
  await expect(estimate(page)).toContainText("Looks manageable based on your recorded information.");
  await expect(estimate(page)).toContainText("₹45,000");
  await expect(estimate(page)).toContainText("₹39,000");
  await expect(estimate(page)).not.toContainText(SHAMING);
  // The basis of the estimate is always visible, not hidden in a details section.
  await expect(estimate(page).getByText(/^Based on what you've recorded in MoneyMap for this pay cycle \(1 \w+ – \d+ \w+\)\. Not your bank balance\.$/)).toBeVisible();
  expect(records("u")).toBe(before); // nothing saved
});

test("tight: explains why, counts each commitment once, and offers options without blocking", async ({ page }) => {
  await signIn(page, "u");
  await open(page, "/afford");
  await page.getByLabel("What is it for? (optional)").fill("headphones");
  await page.getByLabel("How much is it? (₹)").fill("40000");
  const e = estimate(page);
  await expect(e).toContainText("This could make the rest of your month a little tighter. Want to explore your options?");
  await expect(e).toContainText("₹5,000"); // after it
  await expect(e).toContainText("Breathing room (10% of this cycle's income)");
  await expect(e).toContainText("₹10,000");
  await expect(e).toContainText("Rent");
  await expect(e).toContainText("SIP");
  await expect(e).not.toContainText("HDFC card"); // reminder-only, never counted
  await expect(e).toContainText("Not now doesn't mean never.");
  await expect(e).not.toContainText(SHAMING);

  await e.getByRole("button", { name: "Plan for it" }).click();
  const plan = e.getByRole("link", { name: /Over 3 months/ });
  await expect(plan).toContainText("₹13,334 a month");
  const href = (await plan.getAttribute("href"))!;
  expect(decodeURIComponent(href)).toContain("name=Saving towards headphones");
  expect(href).toContain("frequency=monthly");
  // The plan is only a pre-filled form: nothing exists until the user saves it there.
  const before = records("u");
  await plan.click();
  await expect(page.getByLabel("Name")).toHaveValue("Saving towards headphones");
  expect(records("u")).toBe(before);
});

test("short: calm wording, and the after-payday view with its own numbers", async ({ page }) => {
  await signIn(page, "u");
  await open(page, "/afford");
  await page.getByLabel("How much is it? (₹)").fill("60000");
  const e = estimate(page);
  await expect(e).toContainText("This may leave you short before payday. Let's see whether a different amount or timeline could work.");
  await expect(e).toContainText("−₹15,000");
  await expect(e).not.toContainText(SHAMING);

  await e.getByRole("button", { name: "See it after payday" }).click();
  await expect(e).toContainText("Even after payday, this may leave you short.");
  await expect(e).toContainText("₹35,000"); // rent + SIP next cycle
  await expect(e).toContainText("₹30,000"); // everyday budget
  await expect(e).toContainText("−₹25,000");
  await expect(e).toContainText("not a promise");
  await expect(e.getByText(/^Based on the income, regular payments and budget recorded in MoneyMap, applied to the next pay cycle/)).toBeVisible();

  await page.getByLabel("How much is it? (₹)").fill("20000");
  await expect(e).toContainText("After payday, this looks manageable based on your recorded information.");
  await expect(page.getByText(/never blocks a purchase/)).toBeVisible();
});

test("incomplete information: says so instead of guessing", async ({ page }) => {
  await signIn(page, "v");
  await open(page, "/afford");
  await page.getByLabel("How much is it? (₹)").fill("5000");
  const e = estimate(page);
  await expect(e).toContainText("We need a little more information before we can estimate this.");
  await expect(e.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(e).not.toContainText(/manageable|tighter|short/i);
});

test("fits a 360px phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, "u");
  await open(page, "/afford");
  await page.getByLabel("How much is it? (₹)").fill("40000");
  await page.getByRole("button", { name: "Plan for it" }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/afford-360.png`, fullPage: true });
});

test("after payday: commitments already paid early are explained, never counted twice", async ({ page }) => {
  // U pays next cycle's SIP today (early).
  execFileSync("psql", ["-h", process.env.PGHOST!, "-p", process.env.PGPORT!, "-U", "postgres", "-d", "mm_e2e", "-v", "ON_ERROR_STOP=1", "-tAc", `
    insert into public.commitment_payments (user_id, commitment_id, due_date, outcome, amount_paise, paid_on)
    select c.user_id, c.id, (date_trunc('month', c.next_due_date) + interval '2 month - 1 day')::date, 'paid', 1000000, (now() at time zone 'Asia/Kolkata')::date
    from public.commitments c where c.user_id = '${USERS.u.id}' and c.name = 'SIP';`]);
  await signIn(page, "u");
  await open(page, "/afford");
  await page.getByLabel("How much is it? (₹)").fill("5000");
  await page.getByRole("button", { name: /After payday/ }).click();
  const e = estimate(page);
  await expect(e).toContainText("₹10,000 of them already paid early this cycle");
  await expect(e).toContainText("−₹25,000"); // only rent is still due that cycle
  await expect(e).not.toContainText("−₹0");
});
