import { expect, test, type Page } from "@playwright/test";
import { payCycle } from "../src/lib/engine/cycle";
import { addDays, istToday } from "../src/lib/engine/dates";
import { projectOccurrences } from "../src/lib/engine/schedule";
import { sessionCookie } from "./local/session";

async function signIn(page: Page, user: "a" | "b") {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/" }]);
}

// Open a page and wait until it is interactive before typing into its forms.
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

// Next.js keeps recently visited pages alive but hidden, so only match visible elements.
const label = (page: Page, value: string | RegExp) => page.getByLabel(value).filter({ visible: true });
const text = (page: Page, value: string | RegExp) => page.getByText(value).filter({ visible: true });

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

test.describe.configure({ mode: "serial" });

// User B (payday 1 by default) owns everything in this file.
const today = istToday();
const firstDue = addDays(today, -95);
const missed = projectOccurrences(
  { frequency: "monthly", anchor_day: Number(firstDue.slice(8)), next_due_date: firstDue, end_date: null },
  addDays(today, -1),
);
const cycleStart = payCycle(1, today).start;

test("catch up records only the chosen dates", async ({ page }) => {
  expect(missed.length).toBeGreaterThanOrEqual(3);
  await signIn(page, "b");

  await open(page, "/commitments/new?type=bill");
  await label(page, "Name").fill("Broadband");
  await label(page, "Type").selectOption("internet");
  await label(page, /Amount each time/).fill("1000");
  await label(page, "Next due date").fill(firstDue);
  await expect(text(page, "more than one payment ago")).toBeVisible();
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(page).toHaveURL(/\/commitments\?tab=all$/);

  await page.goto("/commitments?tab=upcoming");
  await expect(text(page, `${missed.length} missed dates.`)).toBeVisible();
  await page.getByRole("link", { name: "Catch up" }).click();
  await expect(page.getByRole("button", { name: "Choose at least one date" })).toBeDisabled();

  // Every row starts unresolved; "paid earlier" only exists before the current cycle.
  for (const date of missed) {
    const row = page.getByRole("group", { name: `Due ${fmt(date)}` });
    await expect(row.getByRole("radio", { name: /Leave unresolved/ })).toBeChecked();
    await expect(row.getByRole("radio", { name: /Paid earlier, amount not recorded/ })).toHaveCount(date < cycleStart ? 1 : 0);
  }

  const [d0, d1, d2] = missed;
  await page.getByRole("group", { name: `Due ${fmt(d0)}` }).getByRole("radio", { name: /Paid earlier/ }).check();
  await page.getByRole("group", { name: `Due ${fmt(d1)}` }).getByRole("radio", { name: /^Paid$/ }).check();
  await expect(label(page, `Amount paid for ${d1}`)).toHaveValue("1000");
  await expect(label(page, `Paid on for ${d1}`)).toHaveValue(d1);
  await page.getByRole("group", { name: `Due ${fmt(d2)}` }).getByRole("radio", { name: /Didn't need to pay/ }).check();
  await page.getByRole("button", { name: "Save 3 dates" }).click();

  await expect(text(page, "Caught up: 3 dates recorded.")).toBeVisible();
  const remaining = missed.slice(3);
  if (remaining.length >= 2) {
    await expect(text(page, `${remaining.length} missed dates.`)).toBeVisible();
  } else if (remaining.length === 1) {
    await expect(page.getByRole("button", { name: `Mark Broadband due ${fmt(remaining[0])} paid` })).toBeVisible();
  }
});

test("mark paid with an edited amount, edit an older payment, then undo", async ({ page }) => {
  await signIn(page, "b");
  await page.goto("/commitments?tab=upcoming");

  // Settle whatever is open next for Broadband (overdue or upcoming) as paid at ₹1,050.
  const next = missed[3] ?? projectOccurrences(
    { frequency: "monthly", anchor_day: Number(firstDue.slice(8)), next_due_date: firstDue, end_date: null },
    addDays(today, 60),
  ).find((d) => d > missed[2])!;
  const name = `Broadband due ${fmt(next)}`;
  await page.getByRole("button", { name: `Mark ${name} paid` }).click();
  await label(page, `Amount paid for ${name}`).fill("1050");
  await label(page, `Paid on for ${name}`).fill(today);
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByRole("button", { name: `Mark ${name} paid` })).toHaveCount(0);

  await page.getByRole("link", { name: "Broadband" }).first().click();
  const history = page.getByRole("listitem").filter({ hasText: `Due ${fmt(next)}` }).filter({ visible: true });
  await expect(history).toContainText("₹1,050");
  await expect(history.getByRole("button", { name: "Undo" })).toBeVisible();

  // Older records can be edited but not undone.
  const older = page.getByRole("listitem").filter({ hasText: `Due ${fmt(missed[1])}` }).filter({ visible: true });
  await expect(older.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await older.getByRole("button", { name: "Edit" }).click();
  await older.getByLabel("Amount paid (₹)").fill("999");
  await older.getByRole("button", { name: "Save" }).click();
  await expect(older).toContainText("₹999");

  await history.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: `Due ${fmt(next)}` }).filter({ visible: true })).toHaveCount(0);

  await page.goto("/commitments?tab=upcoming");
  await expect(page.getByRole("button", { name: `Mark ${name} paid` }).or(text(page, /missed dates\./))).toBeVisible();
});

test("only the earliest open date of an item can be settled", async ({ page }) => {
  await signIn(page, "b");
  await page.goto("/commitments?tab=upcoming");
  const settleable = page.getByRole("button", { name: /^Mark Broadband due .* paid$/ });
  await expect(settleable).toHaveCount(1);
  await expect(text(page, "Settle the earlier date first.").first()).toBeVisible();
});

test("skip a due date", async ({ page }) => {
  await signIn(page, "b");
  await open(page, "/commitments/new?type=subscription");
  await label(page, "Service").fill("Streaming subscription");
  await label(page, /Amount each time/).fill("649");
  const due = addDays(today, 5);
  await label(page, "Next charge date").fill(due);
  await page.getByRole("button", { name: "Add commitment" }).click();

  await page.goto("/commitments?tab=upcoming");
  const name = `Streaming subscription due ${fmt(due)}`;
  await page.getByRole("button", { name: `Skip ${name}` }).click();
  await page.getByRole("button", { name: "Yes, skip it" }).click();
  await expect(page.getByRole("button", { name: `Skip ${name}` })).toHaveCount(0);
});

test("spending: validate, add, edit, extra income, delete and switch cycles", async ({ page }) => {
  await signIn(page, "b");
  await page.goto("/spending");
  await expect(text(page, "No spending logged this cycle")).toBeVisible();

  await page.getByRole("link", { name: "Add", exact: true }).click();
  await label(page, "Category").selectOption("groceries");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(text(page, "Enter an amount above ₹0, like 450 or 1299.50")).toBeVisible();
  await expect(label(page, "Category")).toHaveValue("groceries");
  await expect(page.getByRole("option", { name: /Rent/ })).toHaveCount(0);

  await label(page, "Amount (₹)").fill("450");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page).toHaveURL(/\/spending\?on=/);
  await expect(page.getByRole("link", { name: /Groceries.*₹450/ })).toBeVisible();
  await expect(text(page, "Spent ₹450 this cycle.")).toBeVisible(); // user B has no budget set
  await expect(text(page, /Groceries.*₹450.*100%/).first()).toBeVisible();

  await page.getByRole("link", { name: /Groceries.*₹450/ }).click();
  await label(page, "Amount (₹)").fill("500");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("link", { name: /Groceries.*₹500/ })).toBeVisible();

  await page.getByRole("link", { name: "Add", exact: true }).click();
  await page.getByText("Extra income", { exact: true }).filter({ visible: true }).click();
  await label(page, "Amount (₹)").fill("2000");
  await page.getByRole("button", { name: "Add income" }).click();
  await expect(text(page, "Extra income this cycle: ₹2,000")).toBeVisible();
  await expect(text(page, "Spent ₹500 this cycle.")).toBeVisible(); // income doesn't change spending

  await page.getByRole("link", { name: /Groceries.*₹500/ }).click();
  await text(page, "Delete…").click();
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(page.getByRole("link", { name: /Groceries/ })).toHaveCount(0);

  await page.getByRole("link", { name: "← Previous" }).click();
  await expect(text(page, "No spending logged in this cycle")).toBeVisible();
  await expect(page.getByRole("link", { name: "Next →" })).toBeVisible();
});

test("user A cannot open user B's spending or catch-up pages", async ({ page }) => {
  await signIn(page, "b");
  await page.goto("/spending");
  await page.getByRole("link", { name: /Extra income/ }).click();
  await expect(page).toHaveURL(/\/spending\/[0-9a-f-]{36}$/);
  const spendingUrl = page.url();
  await page.goto("/commitments?tab=all");
  await page.getByRole("link", { name: /Broadband/ }).click();
  await expect(page).toHaveURL(/\/commitments\/[0-9a-f-]{36}$/);
  const catchUpUrl = `${page.url()}/catch-up`;

  await signIn(page, "a");
  for (const url of [spendingUrl, catchUpUrl]) {
    await page.goto(url);
    await expect(text(page, /could not be found|404/i).first()).toBeVisible();
  }
});

test("milestone 3 screens fit a 360px-wide phone", async ({ page }) => {
  await signIn(page, "b");
  await page.goto("/commitments?tab=all");
  await page.getByRole("link", { name: /Broadband/ }).click();
  await expect(page).toHaveURL(/\/commitments\/[0-9a-f-]{36}$/);
  const itemPath = new URL(page.url()).pathname;
  for (const path of ["/commitments?tab=upcoming", itemPath, `${itemPath}/catch-up`, "/spending", "/spending/new"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    await expect(text(page, /could not be found|404/i)).toHaveCount(0);
    if (process.env.SCREENSHOT_DIR) {
      const name = path.replace(itemPath, "/item").replace(/[/?=]/g, "_");
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/m3${name}.png`, fullPage: true });
    }
  }
});
