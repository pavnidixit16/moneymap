import { expect, test, type Page } from "@playwright/test";
import { sessionCookie } from "./local/session";

async function signIn(page: Page, user: "a" | "b") {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/" }]);
}

function isoDaysFromToday(days: number) {
  const ist = new Date(Date.now() + 5.5 * 3600_000 + days * 86400_000);
  return ist.toISOString().slice(0, 10);
}

// Open a page and wait until it is interactive before typing into its forms.
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

// Next.js keeps recently visited pages alive but hidden, so only match visible elements.
const label = (page: Page, value: string | RegExp) => page.getByLabel(value).filter({ visible: true });
const text = (page: Page, value: string | RegExp) => page.getByText(value).filter({ visible: true });

test.describe.configure({ mode: "serial" });

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/commitments");
  await expect(page).toHaveURL(/\/login\?next=%2Fcommitments/);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("first run: settings validation keeps input, then saves", async ({ page }) => {
  await signIn(page, "a");
  await page.goto("/overview");
  await page.getByRole("link", { name: "Set up MoneyMap" }).click();
  await expect(page).toHaveURL(/\/settings/);

  await label(page, "Payday (day of the month)").selectOption("25");
  await label(page, "Spending budget per pay cycle (₹)").fill("20000");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(text(page, "Enter your monthly take-home pay, like 80000")).toBeVisible();
  await expect(label(page, "Payday (day of the month)")).toHaveValue("25");
  await expect(label(page, "Spending budget per pay cycle (₹)")).toHaveValue("20000");

  await label(page, "Monthly take-home pay (₹)").fill("80,000");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/commitments\?welcome=1/);
  await expect(text(page, "Settings saved.")).toBeVisible();

  await page.goto("/settings");
  await expect(label(page, "Monthly take-home pay (₹)")).toHaveValue("80000");
  await expect(label(page, "Payday (day of the month)")).toHaveValue("25");
});

test("add, validate, edit, cancel, reactivate and delete a commitment", async ({ page }) => {
  await signIn(page, "a");
  await page.goto("/commitments");
  await expect(text(page, "Add what you pay regularly")).toBeVisible();

  await page.getByRole("link", { name: "+ Rent" }).first().click();
  await expect(label(page, "Name")).toHaveValue("Rent");
  await expect(page.getByRole("radio", { name: /Count it/ })).toBeChecked();
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(text(page, "Enter the amount (an estimate is fine)")).toBeVisible();
  await expect(text(page, "Enter the next due date")).toBeVisible();
  await expect(label(page, "Name")).toHaveValue("Rent");

  await label(page, /Amount each time/).fill("22000");
  await label(page, "Next due date").fill(isoDaysFromToday(10));
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(page).toHaveURL(/\/commitments\?tab=all$/);
  await expect(page.getByRole("link", { name: /Rent.*₹22,000/ })).toBeVisible();

  await page.getByRole("link", { name: /Rent.*₹22,000/ }).click();
  await label(page, /Amount each time/).fill("23,500");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("link", { name: /Rent.*₹23,500/ })).toBeVisible();

  await page.getByRole("link", { name: /Rent.*₹23,500/ }).click();
  await page.getByRole("button", { name: "Mark as cancelled" }).click();
  await expect(text(page, "This doesn't cancel it with the provider.")).toBeVisible();
  await page.getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByRole("button", { name: "Mark as cancelled" })).toBeVisible();

  await text(page, "Delete…").click();
  await expect(text(page, "and its payment history")).toBeVisible();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/commitments$/);
  await expect(text(page, "Add what you pay regularly")).toBeVisible();
});

test("tracking-mode defaults: card is reminder-only, FD is info-only", async ({ page }) => {
  await signIn(page, "a");
  await open(page, "/commitments/new?preset=card");
  await expect(page.getByRole("radio", { name: /Reminder only/ })).toBeChecked();
  await label(page, "Next due date").fill(isoDaysFromToday(5));
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(page.getByRole("link", { name: /Credit card bill.*Reminder only/ })).toBeVisible();

  await open(page, "/commitments/new?preset=fd");
  await expect(page.getByRole("radio", { name: /Info only/ })).toBeChecked();
  await expect(label(page, "Next due date")).toHaveCount(0);
  await label(page, /^Amount/).fill("100000");
  await label(page, /Maturity or renewal date/).fill(isoDaysFromToday(40));
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(page.getByRole("link", { name: /Fixed deposit.*Matures.*Info only/ })).toBeVisible();
});

test("an old first due date offers the next upcoming date", async ({ page }) => {
  await signIn(page, "a");
  await open(page, "/commitments/new?preset=sip");
  await label(page, "Next due date").fill(isoDaysFromToday(-75));
  await expect(text(page, "more than one payment ago")).toBeVisible();
  await page.getByRole("button", { name: /^Use / }).click();
  await expect(text(page, "more than one payment ago")).toHaveCount(0);
  const value = await label(page, "Next due date").inputValue();
  expect(value >= isoDaysFromToday(0)).toBe(true);
});

test("another user sees none of user A's data", async ({ page }) => {
  await signIn(page, "a");
  await page.goto("/commitments?tab=all");
  await page.getByRole("link", { name: /Credit card bill/ }).first().click();
  await expect(page).toHaveURL(/\/commitments\/[0-9a-f-]{36}$/);
  await expect(label(page, "Name")).toHaveValue("Credit card bill");
  const url = page.url();

  await signIn(page, "b");
  await page.goto("/commitments");
  await expect(text(page, "Add what you pay regularly")).toBeVisible();
  await page.goto(url);
  await expect(text(page, /could not be found|404/i).first()).toBeVisible();
  await expect(label(page, "Name")).toHaveCount(0);
});

test("every screen fits a 360px-wide phone without sideways scrolling", async ({ page }) => {
  await signIn(page, "a");
  for (const path of ["/overview", "/commitments", "/commitments/new?preset=insurance", "/settings", "/privacy"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    if (process.env.SCREENSHOT_DIR) {
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${path.replace(/[/?=]/g, "_")}.png`, fullPage: true });
    }
  }
});
