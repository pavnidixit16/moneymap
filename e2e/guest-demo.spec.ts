import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { guestDemo } from "../src/lib/demo-data";
import { payCycle } from "../src/lib/engine/cycle";
import { istToday } from "../src/lib/engine/dates";
import { computeOverview } from "../src/lib/engine/overview";
import { formatINR } from "../src/lib/money";
import { sessionCookie, USERS } from "./local/session";

const text = (page: Page, value: string | RegExp) => page.getByText(value).filter({ visible: true });
const sql = (query: string) =>
  execFileSync("psql", ["-h", process.env.PGHOST!, "-p", process.env.PGPORT!, "-U", "postgres", "-d", "mm_e2e", "-tAc", query]).toString().trim();
// Every user-data table, row counts and a checksum of their contents.
const databaseSnapshot = () =>
  sql(`select concat_ws(' | ',
    (select count(*) from auth.users), (select count(*) from public.profiles),
    (select count(*) || ':' || coalesce(sum(amount_paise), 0) from public.transactions),
    (select count(*) || ':' || coalesce(sum(amount_paise), 0) from public.commitments),
    (select count(*) from public.commitment_payments), (select count(*) from public.daily_checkins),
    (select count(*) from public.achievements), (select md5(coalesce(string_agg(p::text, ',' order by id), '')) from public.profiles p))`);

// What the real engine says the demo should show today.
function expectedEstimate() {
  const today = istToday();
  const d = guestDemo(today);
  const cycle = payCycle(d.profile.payday_day, today);
  const transactions = d.transactions.filter((t) => t.occurred_on >= cycle.start && t.occurred_on <= cycle.end);
  return formatINR(computeOverview({ profile: d.profile, transactions, commitments: d.commitments, payments: [], today }).remainingPaise);
}

test.describe.configure({ mode: "serial" });

test("a signed-out visitor tries the demo from the login screen: no Google, no account, nothing saved", async ({ page }) => {
  await page.context().clearCookies(); // like an incognito window
  const before = databaseSnapshot();

  await page.goto("/login");
  const tryDemo = page.getByRole("link", { name: /Try MoneyMap demo/ });
  await expect(tryDemo).toContainText("no sign-in required");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await tryDemo.click();

  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("note", { name: "Demo mode" })).toContainText("You're exploring MoneyMap with sample data. All figures are fictional.");
  await expect(text(page, "Your money at a glance")).toBeVisible();
  await expect(page.getByTestId("estimate")).toHaveText(expectedEstimate());
  await expect(text(page, "House rent").first()).toBeVisible();
  // Read-only: no actions that need an account.
  await expect(page.getByRole("link", { name: /Add expense|Add bill|Smart add/ })).toHaveCount(0);

  await page.getByRole("navigation", { name: "Demo" }).getByRole("link", { name: "Commitments" }).click();
  await expect(page).toHaveURL(/\/demo\/commitments/);
  await expect(text(page, "Next 60 days")).toBeVisible();
  await expect(text(page, "House rent").first()).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "HDFC Millennia" }).first()).toContainText("Reminder only");
  await expect(page.getByRole("button", { name: /Mark .* paid/ })).toHaveCount(0);
  await page.getByRole("link", { name: "All", exact: true }).click();
  await expect(text(page, "Nifty 50 index fund").first()).toBeVisible();
  await expect(text(page, "SBI fixed deposit")).toBeVisible();

  await page.getByRole("navigation", { name: "Demo" }).getByRole("link", { name: "Spending" }).click();
  await expect(page).toHaveURL(/\/demo\/spending/);
  await expect(text(page, "By category")).toBeVisible();
  await expect(text(page, "Groceries").first()).toBeVisible();
  await expect(text(page, "Extra income this cycle: ₹5,000")).toBeVisible();

  await page.getByRole("navigation", { name: "Demo" }).getByRole("link", { name: "Afford it?" }).click();
  await page.getByLabel("How much is it? (₹)").fill("6000");
  await expect(page.getByRole("region", { name: "Estimate" })).toContainText("Looks manageable");

  await page.getByRole("navigation", { name: "Demo" }).getByRole("link", { name: "Home" }).click();
  await expect(page.getByTestId("estimate")).toHaveText(expectedEstimate());

  // No session was created, and nothing in the database changed.
  expect((await page.context().cookies()).filter((c) => c.name.startsWith("sb-"))).toEqual([]);
  expect(databaseSnapshot()).toBe(before);

  // Exit demo: back to sign-in, nothing left behind.
  await page.getByRole("link", { name: "Exit demo" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(databaseSnapshot()).toBe(before);
});

test("real accounts are untouched, and Google sign-in still leads to the user's own dashboard", async ({ page }) => {
  const id = USERS.u.id; // a set-up user with their own records
  const own = () => sql(`select (select count(*) from public.commitments where user_id = '${id}') || '/' || (select count(*) from public.transactions where user_id = '${id}') || '/' || (select count(*) from public.commitments where user_id = '${id}' and is_sample)`);
  const before = own();

  // Signed in, then visiting the demo too: the demo still shows only fictional data.
  await page.context().clearCookies();
  await page.context().addCookies([{ ...sessionCookie("u"), domain: "localhost", path: "/" }]);
  await page.goto("/demo");
  await expect(text(page, "Your money at a glance")).toBeVisible();
  await expect(page.getByTestId("estimate")).toHaveText(expectedEstimate());

  await page.goto("/overview");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("note")).toHaveCount(0); // no sample-data banner in the real account
  await expect(text(page, "House rent")).toHaveCount(0);
  expect(own()).toBe(before);

  // Signed-out visitors still can't reach real pages.
  await page.context().clearCookies();
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login/);
});

for (const width of [360, 1280]) {
  test(`login and demo fit a ${width}px screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });
    await page.context().clearCookies();
    for (const [path, shot] of [["/login", "login"], ["/demo", "demo-home"], ["/demo/commitments", "demo-commitments"], ["/demo/spending", "demo-spending"]] as const) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
      if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${shot}-${width}.png`, fullPage: true });
    }
  });
}
