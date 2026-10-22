import { expect, test, type Page } from "@playwright/test";
import { sessionCookie } from "./local/session";

async function signIn(page: Page, user: "a" | "b") {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/" }]);
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

const text = (page: Page, value: string | RegExp) => page.getByText(value).filter({ visible: true });
const monthly = (page: Page) => page.getByTestId("subs-monthly").filter({ visible: true });

test.describe.configure({ mode: "serial" });

test("sample data loads, is labelled, and clears without touching real records", async ({ page }) => {
  await signIn(page, "b");
  await open(page, "/subscriptions");
  const before = await monthly(page).textContent();

  await open(page, "/settings");
  await page.getByRole("button", { name: "Load sample data" }).click();
  await expect(text(page, /Sample data loaded/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear sample data" })).toBeVisible();

  await open(page, "/subscriptions");
  await expect(text(page, "Netflix")).toBeVisible();
  await expect(text(page, "Sample").first()).toBeVisible();
  expect(await monthly(page).textContent()).not.toBe(before);

  await open(page, "/commitments?tab=all");
  await page.getByRole("link", { name: /SBI fixed deposit.*Sample/ }).click();
  await expect(text(page, "Info only").first()).toBeVisible();
  await expect(text(page, /Matures/).first()).toBeVisible();

  // User B never finished setup, so Home shows the welcome card; sample items appear in Upcoming.
  await open(page, "/commitments?tab=upcoming");
  await expect(text(page, "House rent").first()).toBeVisible();

  await open(page, "/settings");
  await page.getByRole("button", { name: "Clear sample data" }).click();
  await expect(text(page, /Sample data removed/)).toBeVisible();

  await open(page, "/subscriptions");
  await expect(monthly(page)).toHaveText(before!);
  await expect(text(page, "Netflix")).toHaveCount(0);
  await expect(text(page, "Music app")).toBeVisible(); // user B's own record survives
});
