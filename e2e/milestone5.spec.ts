import { expect, test, type Page } from "@playwright/test";
import { payCycle } from "../src/lib/engine/cycle";
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

const label = (page: Page, value: string | RegExp) => page.getByLabel(value).filter({ visible: true });
const rupees = (s: string | null) => Number((s ?? "").replace(/[^0-9-]/g, ""));
const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

test("paying a date after payday early is explained and counted in this cycle", async ({ page }) => {
  await signIn(page, "a"); // payday 25 (set in milestone2.spec)
  const today = istToday();
  const due = addDays(payCycle(25, today).end, 3);

  await open(page, "/overview");
  const before = rupees(await page.getByTestId("estimate").filter({ visible: true }).textContent());

  await open(page, "/commitments/new?type=emi");
  await label(page, "EMI amount (₹)").fill("9500");
  await label(page, "Next EMI date").fill(due);
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(page).toHaveURL(/tab=all/);

  await open(page, "/commitments?tab=upcoming");
  await page.getByRole("button", { name: `Mark Loan EMI due ${fmt(due)} paid` }).click();
  await expect(text(page, /due after your next payday/)).toBeVisible();
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByRole("button", { name: `Mark Loan EMI due ${fmt(due)} paid` })).toHaveCount(0);

  await open(page, "/overview");
  await expect(page.getByTestId("estimate").filter({ visible: true })).toHaveText(`₹${(before - 9500).toLocaleString("en-IN")}`);
  await text(page, "How is this calculated?").click();
  await expect(text(page, /includes ₹9,500 paid early for dates after your next payday/)).toBeVisible();
});

test("revisiting a tab is instant, and a change shows up immediately on other tabs", async ({ page }) => {
  const { readFileSync } = await import("node:fs");
  const dataCalls = () => readFileSync("/tmp/moneymap-gateway.log", "utf8").split("\n").filter((l) => l.includes("/rest/v1")).length;
  const nav = (name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name });
  const estimateText = () => page.getByTestId("estimate").filter({ visible: true }).textContent();

  await signIn(page, "a");
  await open(page, "/overview");
  const before = rupees(await estimateText());

  await nav("Spending").click();
  await expect(page).toHaveURL(/\/spending$/);
  await expect(text(page, "Spending budget")).toBeVisible();
  await nav("Home").click();
  await expect(page.getByTestId("estimate").filter({ visible: true })).toBeVisible();

  // Within the 60 s window, going back to Spending needs no new data requests.
  const callsBefore = dataCalls();
  await nav("Spending").click();
  await expect(text(page, "Spending budget")).toBeVisible();
  await page.waitForTimeout(500);
  expect(dataCalls() - callsBefore).toBe(0);

  // After a change, other tabs show fresh figures straight away.
  await page.getByRole("link", { name: /^Add$/ }).click();
  await label(page, "Amount (₹)").fill("500");
  await expect(page.getByRole("button", { name: "Add expense" })).toBeEnabled();
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page).toHaveURL(/\/spending\?on=/);
  await nav("Home").click();
  await expect(page.getByTestId("estimate").filter({ visible: true })).toHaveText(`₹${(before - 500).toLocaleString("en-IN")}`);
});
