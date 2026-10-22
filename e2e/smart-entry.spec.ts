import { expect, test, type Page } from "@playwright/test";
import { addDays, istToday } from "../src/lib/engine/dates";
import { sessionCookie } from "./local/session";

// User C is only used here, so every count below starts from an empty account.
async function signIn(page: Page) {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...sessionCookie("c"), domain: "localhost", path: "/" }]);
}
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}
const text = (page: Page, value: string | RegExp) => page.getByText(value).filter({ visible: true });
const review = (page: Page) => page.getByRole("region", { name: "Review draft" });
const today = istToday();
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

async function readIt(page: Page, sentence: string) {
  await open(page, "/spending/smart");
  await page.getByRole("textbox").fill(sentence);
  await page.getByRole("button", { name: "Read it" }).click();
  await expect(review(page)).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("a draft is not saved until confirmed, and discarding saves nothing", async ({ page }) => {
  await signIn(page);
  await readIt(page, "I spent ₹450 on dinner yesterday");
  await expect(review(page)).toContainText("₹450");
  await expect(review(page)).toContainText("Food & dining");
  await expect(review(page)).toContainText(fmt(addDays(today, -1)));
  await expect(review(page)).toContainText("Typed or pasted text");

  // Leaving without confirming saves nothing.
  await open(page, `/spending?on=${addDays(today, -1)}`);
  await expect(text(page, /No spending logged/)).toBeVisible();

  // The unsaved draft is kept; discarding it saves nothing either.
  await open(page, "/spending/smart");
  await expect(text(page, "You have an unsaved draft from earlier.")).toBeVisible();
  await review(page).getByRole("button", { name: "Discard" }).click();
  await expect(review(page)).toHaveCount(0);
  await open(page, `/spending?on=${addDays(today, -1)}`);
  await expect(text(page, /No spending logged/)).toBeVisible();
});

test("missing or invalid amounts cannot be confirmed", async ({ page }) => {
  await signIn(page);
  await readIt(page, "dinner yesterday");
  await expect(review(page)).toContainText("No amount found");
  const confirm = review(page).getByRole("button", { name: "Confirm and save" });
  await expect(confirm).toBeDisabled();
  await review(page).getByLabel("Amount (₹)").fill("0");
  await expect(confirm).toBeDisabled();
  await review(page).getByLabel("Amount (₹)").fill("abc");
  await expect(confirm).toBeDisabled();
  await review(page).getByRole("button", { name: "Discard" }).click();
});

test("a draft can be edited and saved once, even if Confirm is tapped twice", async ({ page }) => {
  await signIn(page);
  await readIt(page, "I spent ₹450 on dinner yesterday via UPI");
  await review(page).getByRole("button", { name: "Edit" }).click();
  await review(page).getByLabel("Amount (₹)").fill("480");
  await review(page).getByRole("button", { name: "Confirm and save" }).dblclick();
  await expect(text(page, /Saved ₹480 · Food & dining|Already saved/)).toBeVisible();

  await open(page, `/spending?on=${addDays(today, -1)}`);
  await expect(page.getByRole("link", { name: /Food & dining.*UPI.*Dinner.*₹480/ })).toHaveCount(1);
});

test("a lost response is retried without creating a duplicate", async ({ page }) => {
  await signIn(page);
  await readIt(page, "lunch 230 today");
  // The server saves, but the browser never sees the reply (e.g. a dropped connection).
  // Server actions post to the page; the confirm call is the one carrying "duplicates".
  let dropped = false;
  await page.route("**/spending/smart", async (route) => {
    const body = route.request().postData() ?? "";
    if (!dropped && route.request().method() === "POST" && body.includes('"duplicates"')) {
      await route.fetch(); // reaches the server, which saves
      await route.abort(); // but the browser never gets the reply
      dropped = true;
    } else await route.continue();
  });
  await review(page).getByRole("button", { name: "Confirm and save" }).click();
  await expect.poll(() => dropped).toBe(true);
  await expect(review(page)).toBeVisible(); // draft kept for retry
  await page.unroute("**/spending/smart");

  await review(page).getByRole("button", { name: "Confirm and save" }).click();
  await expect(text(page, /Already saved: ₹230|Saved ₹230/)).toBeVisible();
  await open(page, `/spending?on=${today}`);
  await expect(page.getByRole("link", { name: /Food & dining.*Lunch.*₹230/ })).toHaveCount(1);
});

test("a failed save keeps the draft, which can be saved after reloading", async ({ page }) => {
  await signIn(page);
  await readIt(page, "groceries 1200 today at BigBasket");
  await page.route("**/spending/smart", (route) =>
    route.request().method() === "POST" && (route.request().postData() ?? "").includes('"duplicates"') ? route.abort() : route.continue(),
  );
  await review(page).getByRole("button", { name: "Confirm and save" }).click();
  await page.waitForTimeout(800);
  await expect(review(page)).toBeVisible();
  await page.unroute("**/spending/smart");

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(text(page, "You have an unsaved draft from earlier.")).toBeVisible();
  await review(page).getByRole("button", { name: "Confirm and save" }).click();
  await expect(text(page, /Saved ₹1,200/)).toBeVisible();
  await open(page, `/spending?on=${today}`);
  await expect(page.getByRole("link", { name: /Groceries.*₹1,200/ })).toHaveCount(1);
});

test("a same-amount, same-day expense is flagged but can still be saved", async ({ page }) => {
  await signIn(page);
  await readIt(page, "dinner 480 yesterday");
  await expect(review(page)).toContainText("Possible duplicate");
  const confirm = review(page).getByRole("button", { name: "Confirm and save" });
  await expect(confirm).toBeDisabled();
  await review(page).getByLabel("This is a different transaction; save it anyway").check();
  await confirm.click();
  await expect(text(page, /Saved ₹480/)).toBeVisible();
  await open(page, `/spending?on=${addDays(today, -1)}`);
  await expect(page.getByRole("link", { name: /Food & dining.*₹480/ })).toHaveCount(2);
});

test("a credit-card bill payment is not saved as spending", async ({ page }) => {
  await signIn(page);
  await readIt(page, "Paid credit card bill 18,000 today");
  await expect(text(page, "This looks like a credit-card bill payment")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm and save" })).toHaveCount(0);
  await page.getByRole("button", { name: "Discard" }).click();
});

test("a card purchase warns when the card bill is also counted", async ({ page }) => {
  await signIn(page);
  await open(page, "/commitments/new?type=card");
  await page.getByLabel("Card issuer").selectOption("SBI Card");
  await page.getByRole("radio", { name: /I don't log card purchases/ }).check();
  await page.getByLabel(/Expected bill amount/).fill("10000");
  await page.getByLabel("Next bill due date").fill(addDays(today, 10));
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(page).toHaveURL(/tab=all/);

  await readIt(page, "shoes 2,999 today on credit card");
  await expect(review(page)).toContainText("would count it twice");
  await expect(review(page).getByRole("button", { name: "Confirm and save" })).toBeDisabled();
  await review(page).getByRole("button", { name: "Discard" }).click();
});

test("a subscription is only suggested, never created", async ({ page }) => {
  await signIn(page);
  await readIt(page, "Netflix 649 renewed today");
  await expect(review(page).getByRole("link", { name: "Add Netflix as a subscription" })).toBeVisible();
  await review(page).getByRole("button", { name: "Discard" }).click();
  await open(page, "/subscriptions");
  await expect(text(page, "No subscriptions yet")).toBeVisible();
});

test("voice falls back to typing when the browser has no speech recognition", async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error -- simulate a browser without the Web Speech API
    delete window.webkitSpeechRecognition;
    // @ts-expect-error -- simulate a browser without the Web Speech API
    delete window.SpeechRecognition;
  });
  await signIn(page);
  await open(page, "/spending/smart");
  await page.getByRole("button", { name: "Speak" }).click();
  await expect(text(page, /Voice input isn't supported in this browser/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Read it" })).toBeVisible();
});

const CSV = [
  "Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance",
  `${today.slice(8)}/${today.slice(5, 7)}/${today.slice(0, 4)},OPENING BALANCE,,,50000.00`,
  `${today.slice(8)}/${today.slice(5, 7)}/${today.slice(0, 4)},UPI-UBER-uber@axis,310.00,,49690.00`,
  `${today.slice(8)}/${today.slice(5, 7)}/${today.slice(0, 4)},AMAZON PAY INDIA,999.00,,48691.00`,
  `${today.slice(8)}/${today.slice(5, 7)}/${today.slice(0, 4)},NEFT CR SALARY,,"85,000.00",133691.00`,
].join("\n");

test("statement import: balances ignored, income off by default, re-import never duplicates", async ({ page }) => {
  await signIn(page);
  await open(page, "/spending/smart");
  await page.getByRole("button", { name: "Statement" }).click();
  await page.getByLabel("Statement file").setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await expect(text(page, /statement.csv: 3 transactions found/)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Uber/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Amazon/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Salary|Neft/i })).not.toBeChecked();
  await expect(page.locator("body")).not.toContainText("₹50,000");
  await page.getByRole("button", { name: /Confirm and save 2 selected/ }).click();
  await expect(text(page, "Saved 2 transactions.")).toBeVisible();

  // The same file again: rows are recognised and cannot be saved twice.
  await page.getByLabel("Statement file").setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await expect(text(page, "Already imported").first()).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Uber/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Confirm and save 0 selected/ })).toBeDisabled();

  await open(page, `/spending?on=${today}`);
  await expect(page.getByRole("link", { name: /Rides & transport.*₹310/ })).toHaveCount(1);
});

test("unsupported files are refused with an explanation", async ({ page }) => {
  await signIn(page);
  await open(page, "/spending/smart");
  await page.getByRole("button", { name: "Statement" }).click();
  await page.getByLabel("Statement file").setInputFiles({ name: "statement.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(text(page, /PDFs, photos and Excel files aren't supported yet/)).toBeVisible();
});

test("smart add fits a 360px-wide phone", async ({ page }) => {
  await signIn(page);
  for (const path of ["/spending/smart"]) {
    await open(page, path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/smart.png`, fullPage: true });
  }
  await readIt(page, "I spent ₹450 on dinner yesterday");
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/smart-review.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await review(page).getByRole("button", { name: "Discard" }).click();
});
