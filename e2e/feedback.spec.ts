import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { sessionCookie, USERS } from "./local/session";

async function signIn(page: Page, user: keyof typeof USERS) {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/" }]);
}
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}
const text = (page: Page, value: string | RegExp) => page.getByText(value).filter({ visible: true });
const responses = () =>
  Number(execFileSync("psql", ["-h", process.env.PGHOST!, "-p", process.env.PGPORT!, "-U", "postgres", "-d", "mm_e2e", "-tAc", "select count(*) from public.feedback_responses"]).toString().trim());

test.describe.configure({ mode: "serial" });

test("before any feedback, the owner sees an empty state, not made-up numbers", async ({ page }) => {
  await signIn(page, "h");
  await open(page, "/settings");
  await page.getByRole("link", { name: "See what testers said (admins only)" }).click();
  await expect(text(page, "No responses yet")).toBeVisible();
});

test("ordinary users can't see the results or download the CSV", async ({ page }) => {
  await signIn(page, "p");
  await open(page, "/settings");
  await expect(page.getByRole("link", { name: /See what testers said/ })).toHaveCount(0);
  await open(page, "/settings/feedback/results");
  await expect(text(page, /could not be found|404/i).first()).toBeVisible();
  const csv = await page.request.get("/settings/feedback/results/csv");
  expect(csv.status()).toBe(404);
});

test("a tester sends feedback: required answers checked, saved once, thanked only after saving", async ({ page }) => {
  await signIn(page, "p");
  await open(page, "/settings");
  await page.getByRole("link", { name: "Share feedback" }).click();
  await expect(page).toHaveURL(/\/settings\/feedback$/);

  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(text(page, "Choose how easy MoneyMap was to use.")).toBeVisible();
  await expect(text(page, "Choose whether you'd use MoneyMap again.")).toBeVisible();
  expect(responses()).toBe(0);

  await page.getByRole("checkbox", { name: "Dashboard and estimated money remaining" }).check();
  await page.getByRole("checkbox", { name: "Voice expense entry" }).check();
  await page.getByRole("radio", { name: "Easy", exact: true }).check();
  await page.getByRole("checkbox", { name: "A feature didn't work" }).check();
  await page.getByLabel("What happened? (optional)").fill("Voice stopped after one sentence");
  // "No issues" clears the specific issues, and vice versa.
  await page.getByRole("checkbox", { name: /No issues/ }).check();
  await expect(page.getByRole("checkbox", { name: "A feature didn't work" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "A feature didn't work" }).check();
  await expect(page.getByRole("checkbox", { name: /No issues/ })).not.toBeChecked();
  await page.getByRole("radio", { name: "Probably yes" }).check();
  await page.getByLabel(/5\. What's your overall feedback/).fill("Calm and clear. Gmail import is the best part.");
  await page.getByRole("checkbox", { name: /You may quote this anonymously/ }).check();

  await page.getByRole("button", { name: "Send feedback" }).dblclick();
  await expect(text(page, /Thank you! Your feedback was saved/)).toBeVisible();
  expect(responses()).toBe(1);
});

test("a failed send keeps the answers and can be retried; sending again replaces, never duplicates", async ({ page }) => {
  let failNext = true;
  await page.route("**/settings/feedback", async (route) => {
    if (route.request().method() === "POST" && failNext) {
      failNext = false;
      await route.abort();
    } else await route.continue();
  });
  await signIn(page, "p");
  await open(page, "/settings/feedback");
  // The earlier answers are shown again.
  await expect(page.getByRole("radio", { name: "Easy", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Okay" }).check();
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't reach MoneyMap" })).toBeVisible();
  await expect(text(page, /Thank you!/)).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Okay" })).toBeChecked();

  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(text(page, /saved and replaces your earlier answers/)).toBeVisible();
  expect(responses()).toBe(1);
});

test("the owner sees real counts, open feedback with quote permission, and a CSV", async ({ page }) => {
  await signIn(page, "q");
  await open(page, "/settings/feedback");
  await page.getByRole("radio", { name: "Very easy" }).check();
  await page.getByRole("checkbox", { name: /No issues/ }).check();
  await page.getByRole("radio", { name: "Definitely yes" }).check();
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(text(page, /Thank you!/)).toBeVisible();

  await signIn(page, "h");
  await open(page, "/settings/feedback/results");
  await expect(page.locator("main, body")).toContainText("2 responses");
  await expect(page.getByRole("listitem").filter({ hasText: "Okay" }).filter({ hasText: "1 of 2" }).first()).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "A feature didn't work" }).filter({ hasText: "1 of 2" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Definitely yes" }).filter({ hasText: "1 of 2" })).toBeVisible();
  await expect(text(page, "Calm and clear. Gmail import is the best part.")).toBeVisible();
  await expect(text(page, "OK to quote")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("example.invalid");

  const csv = await page.request.get("/settings/feedback/results/csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-disposition"]).toContain("moneymap-feedback.csv");
  const body = await csv.text();
  expect(body.split("\r\n").filter(Boolean)).toHaveLength(3);
  expect(body).toContain("Tester 1");
  expect(body).toContain("Voice stopped after one sentence");
  expect(body).not.toContain("example.invalid");
});

test("the feedback form fits a 360px phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, "t");
  await open(page, "/settings/feedback");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/feedback-360.png`, fullPage: true });
});
