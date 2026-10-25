import { expect, test, type Page } from "@playwright/test";
import { sessionCookie } from "./local/session";

async function signIn(page: Page) {
  await page.context().clearCookies();
  // V has no other entries, so nothing is flagged as a duplicate.
  await page.context().addCookies([{ ...sessionCookie("v"), domain: "localhost", path: "/" }]);
}

test("testers can download the sample statements and import them", async ({ page }) => {
  await signIn(page);
  await page.goto("/spending/smart");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Statement" }).click();

  const link = page.getByRole("link", { name: "bank statement" });
  const res = await page.request.get((await link.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  const csv = await res.body();
  expect((await page.request.get((await page.getByRole("link", { name: "card statement" }).getAttribute("href"))!)).status()).toBe(200);

  await page.getByLabel("Statement file").setInputFiles({ name: "moneymap-sample-bank-statement.csv", mimeType: "text/csv", buffer: csv });
  await expect(page.getByText(/moneymap-sample-bank-statement\.csv: 12 transactions found · 2 balance\/summary or unreadable rows ignored/)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Credit card bill/ })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: /NEFT CR/ })).not.toBeChecked(); // income off by default
  await page.getByRole("button", { name: /Confirm and save 9 selected \(₹6,107\.50 spending\)/ }).click();
  await expect(page.getByText("Saved 9 transactions.")).toBeVisible();
});
