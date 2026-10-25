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
const profile = () =>
  execFileSync("psql", ["-h", process.env.PGHOST!, "-p", process.env.PGPORT!, "-U", "postgres", "-d", "mm_e2e", "-tAc",
    `select monthly_income_paise || '/' || cycle_budget_paise || '/' || coalesce(onboarded_at::text, 'none') from public.profiles where id = '${USERS.w.id}'`]).toString().trim();

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
