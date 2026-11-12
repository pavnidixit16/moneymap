import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { demoJourneyStart } from "../src/lib/demo-data";
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

// What the real engine says the demo should show today, before the visitor changes anything.
function expectedLeft(minusRupees = 0) {
  const start = demoJourneyStart(istToday());
  const paise = computeOverview({ profile: start.profile, transactions: start.spending, commitments: start.commitments, payments: [], today: start.today }).remainingPaise;
  return formatINR(paise - minusRupees * 100);
}

test.describe.configure({ mode: "serial" });

test("a signed-out visitor tries the demo: add commitments, see what's left, no Google, nothing saved", async ({ page }) => {
  await page.context().clearCookies(); // like an incognito window
  const before = databaseSnapshot();

  await page.goto("/login");
  const tryDemo = page.getByRole("link", { name: /Try MoneyMap demo/ });
  await expect(tryDemo).toContainText("no sign-in required");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await tryDemo.click();

  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("note", { name: "Demo mode" })).toContainText("You're exploring MoneyMap with sample data. All figures are fictional.");
  await expect(page.getByRole("heading", { name: "Add your commitments. See what’s left until payday." })).toBeVisible();
  const left = page.getByTestId("demo-left");
  await expect(left).toHaveText(expectedLeft());

  const list = page.getByRole("list", { name: "Commitments" });
  await expect(list.getByRole("listitem")).toHaveCount(6);
  await expect(list.getByRole("listitem").filter({ hasText: "HDFC Millennia" })).toContainText("Reminder only");
  await expect(list.getByRole("listitem").filter({ hasText: "Car loan EMI" })).toContainText("after payday");
  await expect(list.getByRole("listitem").filter({ hasText: "House rent" })).toContainText("before payday Counted");

  // Add a commitment due today: what's left drops by exactly its amount.
  const add = async (type: string, name: string, amount: string, due: string) => {
    await page.getByRole("button", { name: "Add a commitment" }).click();
    await page.getByLabel("Type").selectOption({ label: type });
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Amount (₹)").fill(amount);
    await page.getByLabel("Next due date").fill(due);
    await page.getByRole("button", { name: "Add to my month" }).click();
  };
  await add("Subscription", "Gym membership", "2000", istToday());
  await expect(left).toHaveText(expectedLeft(2000));
  await expect(page.getByRole("status")).toContainText("Gym membership added: ₹2,000 less left until payday.");

  // A card bill is a reminder: never counted twice.
  await add("Credit card bill (reminder)", "ICICI card", "9000", istToday());
  await expect(left).toHaveText(expectedLeft(2000));
  await expect(page.getByRole("status")).toContainText("doesn’t change this estimate");

  // Incomplete entries are refused.
  await page.getByRole("button", { name: "Add a commitment" }).click();
  await page.getByRole("button", { name: "Add to my month" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Add a name" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Remove, change the pay, reset.
  await page.getByRole("button", { name: "Remove Gym membership" }).click();
  await expect(left).toHaveText(expectedLeft());
  await page.getByLabel("Take-home pay (₹)").fill("90000");
  await expect(left).toHaveText(expectedLeft(10000));
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(left).toHaveText(expectedLeft());
  await expect(list.getByRole("listitem")).toHaveCount(6);

  // No session was created, and nothing in the database changed.
  expect((await page.context().cookies()).filter((c) => c.name.startsWith("sb-"))).toEqual([]);
  expect(databaseSnapshot()).toBe(before);

  // A reload starts fresh: nothing was kept.
  await add("Rent", "Second flat", "15000", istToday());
  await page.reload();
  await expect(left).toHaveText(expectedLeft());

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
  await expect(page.getByTestId("demo-left")).toHaveText(expectedLeft());

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
    for (const [path, shot] of [["/login", "login"], ["/demo", "demo"]] as const) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
      if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${shot}-${width}.png`, fullPage: true });
    }
    if (process.env.SCREENSHOT_DIR && width === 360) {
      await page.getByRole("button", { name: "Add a commitment" }).click();
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/demo-add-form-360.png`, fullPage: true });
      await page.getByLabel("Name").fill("Gym membership");
      await page.getByLabel("Amount (₹)").fill("2000");
      await page.getByLabel("Next due date").fill(istToday());
      await page.getByRole("button", { name: "Add to my month" }).click();
      await page.waitForTimeout(1000); // let the smooth scroll to the number finish
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/demo-after-add-360.png` });
    }
  });
}
