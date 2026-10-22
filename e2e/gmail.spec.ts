import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { sessionCookie, USERS } from "./local/session";

// The stand-in Google server (e2e/local/fake-google.mjs) holds five emails: an HDFC UPI
// alert (₹640, Zomato), a Swiggy receipt (₹375), an OTP, an HDFC card statement and a
// Netflix renewal (₹649).
async function signIn(page: Page, user: keyof typeof USERS) {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/" }]);
}
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}
const text = (page: Page, value: string | RegExp) => page.getByText(value).filter({ visible: true });
const googleState = async () => (await fetch("http://localhost:3200/__state")).json();

async function gmailTab(page: Page) {
  await open(page, "/spending/smart");
  await page.getByRole("button", { name: "Gmail" }).click();
}

test.describe.configure({ mode: "serial" });

test("connect Gmail, review detected payments, save only what's confirmed, never twice", async ({ page }) => {
  await signIn(page, "g");
  await gmailTab(page);
  await expect(text(page, /Emails, subjects and previews are never stored/)).toBeVisible();
  await page.getByRole("button", { name: "Connect Gmail" }).click();

  await expect(page).toHaveURL(/\/spending\/smart\?tab=gmail&gmail=connected/);
  await expect(text(page, /Gmail connected/)).toBeVisible();
  await expect(text(page, "tester@gmail.com")).toBeVisible();

  // Nothing is read until the user asks.
  expect((await googleState()).messageFetches).toBe(0);
  await page.getByRole("button", { name: "Check Gmail now" }).click();
  await expect(text(page, /Checked 5 emails: 4 to review, 1 skipped/)).toBeVisible();
  expect((await googleState()).lastQuery).toMatch(/^from:\(hdfcbank\.net OR .*\) newer_than:30d/);

  // The card statement goes to Commitments; it is never a spending row.
  await expect(text(page, /HDFC Bank: card statement/)).toBeVisible();
  await expect(text(page, /Total due ₹12,345 by 5 Nov 2026/)).toBeVisible();

  const zomato = page.getByRole("checkbox", { name: /Include Zomato ₹640/ });
  const swiggy = page.getByRole("checkbox", { name: /Include Swiggy ₹375/ });
  const netflix = page.getByRole("checkbox", { name: /Include Netflix ₹649/ });
  await expect(zomato).toBeChecked();
  await expect(swiggy).toBeChecked();
  await swiggy.uncheck();
  await expect(page.getByRole("button", { name: /Confirm and save 2 selected \(₹1,289 spending\)/ })).toBeVisible();
  await netflix.uncheck();

  // Nothing saved yet.
  await open(page, "/spending");
  await expect(page.getByRole("link", { name: /₹640/ })).toHaveCount(0);

  await gmailTab(page);
  await page.getByRole("button", { name: "Check Gmail now" }).click();
  await page.getByRole("checkbox", { name: /Include Swiggy ₹375/ }).uncheck();
  await page.getByRole("checkbox", { name: /Include Netflix ₹649/ }).uncheck();
  await page.getByRole("button", { name: /Confirm and save 1 selected/ }).click();
  await expect(text(page, "Saved 1 transaction.")).toBeVisible();

  // Hide the Netflix email: it won't be proposed again.
  await page.getByRole("listitem").filter({ hasText: "Netflix" }).getByRole("button", { name: "Not a transaction: hide it" }).click();
  await expect(page.getByRole("checkbox", { name: /Include Netflix/ })).toHaveCount(0);

  // A second check skips the saved and hidden emails without opening them.
  const before = (await googleState()).messageFetches;
  await page.getByRole("button", { name: "Check Gmail now" }).click();
  await expect(text(page, /Checked 5 emails: 2 to review, 1 skipped .*, 2 already saved or hidden/)).toBeVisible();
  expect((await googleState()).messageFetches - before).toBe(3);
  await expect(page.getByRole("checkbox", { name: /Include Zomato/ })).toHaveCount(0);

  await open(page, "/spending");
  await expect(page.getByRole("link", { name: /₹640/ })).toHaveCount(1);
});

test("the database holds only ciphertext, never the Google token", async () => {
  const sql = "select encrypted_refresh_token from public.gmail_connections";
  const stored = execFileSync("psql", ["-h", process.env.PGHOST!, "-p", process.env.PGPORT!, "-U", "postgres", "-d", "mm_e2e", "-tAc", sql]).toString().trim();
  expect(stored).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  expect(stored).not.toContain("rt-");
});

test("expired or removed Google access asks the user to reconnect", async ({ page }) => {
  await fetch("http://localhost:3200/__revoke_all");
  await signIn(page, "g");
  await gmailTab(page);
  await page.getByRole("button", { name: "Check Gmail now" }).click();
  await expect(text(page, /has expired or was removed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect Gmail" })).toBeVisible();

  // Reconnecting works and the earlier saved and hidden emails stay handled.
  await page.getByRole("button", { name: "Reconnect Gmail" }).click();
  await expect(text(page, /Gmail connected/)).toBeVisible();
  await page.getByRole("button", { name: "Check Gmail now" }).click();
  await expect(text(page, /2 already saved or hidden/)).toBeVisible();
});

test("another user can't see or use this Gmail connection", async ({ page }) => {
  await signIn(page, "c");
  await gmailTab(page);
  await expect(page.getByRole("button", { name: "Connect Gmail" })).toBeVisible();
  await expect(text(page, "tester@gmail.com")).toHaveCount(0);
});

test("disconnect revokes access at Google and deletes the stored token", async ({ page }) => {
  await signIn(page, "g");
  await gmailTab(page);
  const revokedBefore = (await googleState()).revoked;
  await page.getByRole("button", { name: "Disconnect Gmail" }).click();
  await page.getByRole("button", { name: "Yes, disconnect" }).click();
  await expect(text(page, /MoneyMap's access was removed at Google/)).toBeVisible();
  expect((await googleState()).revoked).toBe(revokedBefore + 1);
  await expect(page.getByRole("button", { name: "Connect Gmail" })).toBeVisible();

  // Saved transactions stay.
  await open(page, "/spending");
  await expect(page.getByRole("link", { name: /₹640/ })).toHaveCount(1);
});

test("cancelling on Google's screen, or unticking Gmail, connects nothing", async ({ page }) => {
  await signIn(page, "d");
  await gmailTab(page);
  await page.getByRole("button", { name: "Connect Gmail" }).click();
  await expect(text(page, "You cancelled on Google's screen, so nothing was connected.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Gmail" })).toBeVisible();

  await signIn(page, "e");
  await gmailTab(page);
  await page.getByRole("button", { name: "Connect Gmail" }).click();
  await expect(text(page, /Gmail access wasn't ticked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Gmail" })).toBeVisible();
});

test("a forged or replayed callback is refused", async ({ page }) => {
  await signIn(page, "c");
  await open(page, "/api/gmail/callback?code=stolen&state=guess");
  await expect(page).toHaveURL(/gmail=expired/);
  await expect(page.getByRole("button", { name: "Connect Gmail" })).toBeVisible();
});
