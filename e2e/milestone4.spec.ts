import { expect, test, type Page } from "@playwright/test";
import { addDays, istToday } from "../src/lib/engine/dates";
import { sessionCookie } from "./local/session";

async function signIn(page: Page, user: "a" | "b") {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/" }]);
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

const label = (page: Page, value: string | RegExp) => page.getByLabel(value).filter({ visible: true });
const text = (page: Page, value: string | RegExp) => page.getByText(value).filter({ visible: true });
const estimate = (page: Page) => page.getByTestId("estimate").filter({ visible: true });

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

test.describe.configure({ mode: "serial" });

const today = istToday();

// User A was set up in milestone2.spec: take-home ₹80,000, payday 25, a reminder-only card
// bill and an info-only FD. Neither of those may ever reduce the estimate.
test("dashboard estimate: due items, payments, skips and exclusions", async ({ page }) => {
  await signIn(page, "a");
  await open(page, "/overview");
  await expect(text(page, "Estimated amount remaining after recorded spending and commitments")).toBeVisible();
  await expect(text(page, /not your bank balance/)).toBeVisible();
  await expect(estimate(page)).toHaveText("₹80,000"); // card is reminder-only, FD is info-only

  await open(page, "/commitments/new?type=rent");
  await label(page, /Amount each time/).fill("20000");
  await label(page, "Next due date").fill(today);
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(page).toHaveURL(/tab=all/);

  await open(page, "/commitments/new?type=sip");
  await label(page, "SIP amount (₹)").fill("5000");
  await label(page, "Next SIP date").fill(today);
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(page).toHaveURL(/tab=all/);

  await open(page, "/spending/new");
  await label(page, "Amount (₹)").fill("1500");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page).toHaveURL(/\/spending\?on=/);

  await open(page, "/overview");
  // 80,000 − 1,500 spending − 20,000 rent due − 5,000 SIP due
  await expect(estimate(page)).toHaveText("₹53,500");
  await text(page, "How is this calculated?").click();
  await expect(text(page, "Bills and EMIs still due before payday")).toBeVisible();
  await expect(text(page, "Savings and investments still due before payday")).toBeVisible();
  await expect(text(page, /Not counted: credit-card bills marked reminder-only/)).toBeVisible();
  await expect(text(page, /Food & dining.*₹1,500.*100%/).first()).toBeVisible();
  await expect(text(page, /1,500.*of.*₹20,000|Set a budget/).first()).toBeVisible();

  // Paying moves rent from "still due" to "paid": the estimate must not change.
  await open(page, "/commitments?tab=upcoming");
  await page.getByRole("button", { name: `Mark Rent due ${fmt(today)} paid` }).click();
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByRole("button", { name: `Mark Rent due ${fmt(today)} paid` })).toHaveCount(0);
  await open(page, "/overview");
  await expect(estimate(page)).toHaveText("₹53,500");

  // Skipping the SIP removes it from the estimate.
  await open(page, "/commitments?tab=upcoming");
  await page.getByRole("button", { name: `Skip SIP due ${fmt(today)}` }).click();
  await page.getByRole("button", { name: "Yes, skip it" }).click();
  await expect(page.getByRole("button", { name: `Skip SIP due ${fmt(today)}` })).toHaveCount(0);
  await open(page, "/overview");
  await expect(estimate(page)).toHaveText("₹58,500");
});

test("insurance keeps cover separate and never counts it", async ({ page }) => {
  await signIn(page, "a");
  await open(page, "/commitments/new?type=insurance");
  await label(page, "Insurer (optional)").fill("Star Health");
  await label(page, "Policy nickname").fill("Family floater");
  await label(page, "Premium (₹)").fill("24000");
  await label(page, /Cover \/ sum insured/).fill("10,00,000");
  await label(page, "Next premium due").fill(addDays(today, 200));
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(page.getByRole("link", { name: /Family floater.*Star Health.*₹24,000/ })).toBeVisible();

  await page.getByRole("link", { name: /Family floater/ }).click();
  await expect(label(page, /Cover \/ sum insured/)).toHaveValue("1000000");
  await open(page, "/overview");
  await expect(estimate(page)).toHaveText("₹58,500");
});

test("subscriptions: totals, keep/review/cancel, reactivate and price increase", async ({ page }) => {
  await signIn(page, "b"); // has "Streaming subscription" ₹649 monthly from milestone3.spec
  await open(page, "/subscriptions");
  await expect(page.getByTestId("subs-monthly").filter({ visible: true })).toHaveText("₹649");
  await expect(page.getByTestId("subs-yearly").filter({ visible: true })).toHaveText("₹7,788");

  await open(page, "/commitments/new?type=subscription");
  await label(page, "Service").fill("Music app");
  await label(page, "Type").selectOption("music");
  await label(page, /Amount each time/).fill("119");
  await label(page, "Next charge date").fill(addDays(today, 9));
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(page).toHaveURL(/tab=all/);

  await open(page, "/subscriptions");
  await expect(page.getByTestId("subs-monthly").filter({ visible: true })).toHaveText("₹768");
  await expect(page.getByTestId("subs-yearly").filter({ visible: true })).toHaveText("₹9,216");

  const music = page.getByRole("group", { name: "Decision for Music app" });
  await music.getByRole("button", { name: "Keep" }).click();
  await expect(music.getByRole("button", { name: "Keep" })).toHaveAttribute("aria-pressed", "true");
  await music.getByRole("button", { name: "Cancelled" }).click();
  await expect(text(page, /doesn't cancel it with the provider/)).toBeVisible();
  await expect(page.getByTestId("subs-monthly").filter({ visible: true })).toHaveText("₹649");

  await page.getByRole("button", { name: "Reactivate Music app" }).click();
  await expect(page.getByTestId("subs-monthly").filter({ visible: true })).toHaveText("₹768");

  // A higher amount is shown as a factual price change, never as a judgement.
  await open(page, "/commitments?tab=all");
  await page.getByRole("link", { name: /Streaming subscription/ }).click();
  await label(page, /Amount each time/).fill("799");
  await page.getByRole("button", { name: "Save changes" }).click();
  await open(page, "/subscriptions");
  await expect(text(page, /Price up from ₹649/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/waste|unnecessary/i);
});

test("card payment behaviour controls whether the bill is counted", async ({ page }) => {
  await signIn(page, "b");
  await open(page, "/commitments/new?type=card");
  await label(page, "Card issuer").selectOption("__other__");
  await label(page, "Issuer name").fill("Example Bank");
  await expect(label(page, "Card nickname")).toHaveValue("Example");
  await page.getByRole("radio", { name: /I don't log card purchases/ }).check();
  await label(page, /Expected bill amount/).fill("3000");
  await label(page, "Next bill due date").fill(addDays(today, 2));
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(page.getByRole("link", { name: /Example.*Example Bank.*₹3,000/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Example.*Reminder only/ })).toHaveCount(0);
});

test("dashboard and subscriptions fit a 360px-wide phone", async ({ page }) => {
  for (const user of ["a", "b"] as const) {
    await signIn(page, user);
    for (const path of ["/overview", "/subscriptions", "/commitments/new", "/commitments/new?type=card", "/login"]) {
      await open(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      if (process.env.SCREENSHOT_DIR) {
        await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/m4_${user}${path.replace(/[/?=]/g, "_")}.png`, fullPage: true });
      }
    }
  }
});
