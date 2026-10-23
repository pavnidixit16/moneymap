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
const streak = (page: Page) => page.getByRole("region", { name: "Streak" }).getByText(/^\d+ days?$/);
const panel = (page: Page) => page.getByRole("region", { name: "Today's check-in" });

// Reads (or seeds) the local test database directly, as the superuser.
function sql(query: string): string {
  return execFileSync("psql", ["-h", process.env.PGHOST!, "-p", process.env.PGPORT!, "-U", "postgres", "-d", "mm_e2e", "-tAc", query]).toString().trim();
}
const count = (table: string, user: keyof typeof USERS) => Number(sql(`select count(*) from public.${table} where user_id = '${USERS[user].id}'`));

// Behaves like iPhone Safari: no sound until the user has tapped the page (Playwright's own
// scripting counts as user activation, so taps are tracked directly). Counts the unmuted
// plays that were allowed.
async function strictSound(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __plays: number };
    w.__plays = 0;
    let tapped = false;
    document.addEventListener("pointerdown", () => (tapped = true), true);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!tapped) return Promise.reject(new DOMException("Blocked", "NotAllowedError"));
      const p = play.call(this);
      p.then(() => {
        if (!this.muted) w.__plays += 1;
      }).catch(() => undefined);
      return p;
    };
  });
  return { plays: () => page.evaluate(() => (window as unknown as { __plays: number }).__plays) };
}

test.describe.configure({ mode: "serial" });

test("a no-spend day: confirmed, saved once, no money recorded, celebrated once", async ({ page }) => {
  const sound = await strictSound(page);
  await signIn(page, "p");
  await open(page, "/progress");
  await expect(streak(page)).toHaveText("0 days");
  await expect(text(page, "No check-ins yet")).toBeVisible();

  await panel(page).getByRole("button", { name: "I didn't spend anything today" }).click();
  // Nothing is saved before the explicit confirmation.
  await expect(panel(page)).toContainText("no purchases or payments today");
  await expect(panel(page)).toContainText("nothing is counted as savings");
  expect(count("daily_checkins", "p")).toBe(0);

  // A double tap still saves exactly one check-in.
  await panel(page).getByRole("button", { name: "Yes, it's a no-spend day" }).dblclick();
  await expect(text(page, "Check-in complete! A no-spend day is logged. You're keeping your money routine going.")).toBeVisible();
  expect(count("daily_checkins", "p")).toBe(1);
  expect(count("transactions", "p")).toBe(0);
  await expect(page.locator("main, body")).not.toContainText(/you saved|saved ₹/i);

  // First check-in: Money Mindful, with the chime (it followed the user's tap).
  await expect(page.getByRole("status", { name: "New achievement" })).toContainText("Money Mindful");
  await expect.poll(sound.plays).toBeGreaterThan(0);
  await expect(streak(page)).toHaveText("1 day");
  await expect(panel(page)).toContainText("Checked in today: no-spend day");
  await expect(page.getByRole("listitem", { name: /Money Mindful: earned/ })).toBeVisible();

  // Revisiting never repeats the celebration or adds a second check-in.
  await open(page, "/progress");
  await expect(page.getByRole("status", { name: "New achievement" })).toHaveCount(0);
  await expect(panel(page).getByRole("button", { name: "I didn't spend anything today" })).toHaveCount(0);
  expect(count("daily_checkins", "p")).toBe(1);
});

test("streaks come from saved history; milestones celebrate once; sound waits for a tap", async ({ page }) => {
  // Six days in a row up to yesterday (seeded directly, bypassing the today-only rule).
  sql(`set session_replication_role = replica;
       insert into public.daily_checkins (user_id, local_date, kind)
       select '${USERS.q.id}', (now() at time zone 'Asia/Kolkata')::date - n, 'reviewed_activity' from generate_series(1, 6) n;`);
  const sound = await strictSound(page);
  await signIn(page, "q");
  await open(page, "/progress");
  await expect(streak(page)).toHaveText("6 days");
  await expect(text(page, /Check in today to keep your 6-day streak going/)).toBeVisible();

  // Earned from history on load: shown at once; the phone blocks sound until the first
  // tap anywhere, which then plays it.
  const found = page.getByRole("status", { name: "New achievement" });
  await expect(found).toContainText("3-day streak");
  await page.waitForTimeout(500);
  expect(await sound.plays()).toBe(0);
  await page.getByRole("heading", { name: "Progress" }).click();
  await expect.poll(sound.plays).toBe(1);
  await found.getByRole("button", { name: "Replay" }).click();
  await expect.poll(sound.plays).toBe(2);

  await open(page, "/progress");
  await expect(page.getByRole("status", { name: "New achievement" })).toHaveCount(0);

  // Today's honest confirmation completes 7 days.
  await panel(page).getByRole("button", { name: "I've already reviewed today's activity" }).click();
  await panel(page).getByRole("button", { name: "Yes, I've reviewed today" }).click();
  await expect(text(page, /Check-in complete! Today's activity is reviewed/)).toBeVisible();
  await expect(page.getByRole("status", { name: "New achievement" })).toContainText("Amazing! A whole week of consistent money check-ins.");
  await expect(streak(page)).toHaveText("7 days");
  await expect(page.getByRole("list", { name: /This week: checked in on/ })).toBeVisible();
  expect(count("transactions", "q")).toBe(0);
});

test("a missed day resets the streak but keeps achievements", async ({ page }) => {
  // Q's history moved back two days: the run ended the day before yesterday.
  sql(`set session_replication_role = replica;
       delete from public.daily_checkins where user_id = '${USERS.q.id}';
       insert into public.daily_checkins (user_id, local_date, kind)
       select '${USERS.q.id}', (now() at time zone 'Asia/Kolkata')::date - n, 'reviewed_activity' from generate_series(2, 8) n;`);
  await signIn(page, "q");
  await open(page, "/progress");
  await expect(streak(page)).toHaveText("0 days");
  await expect(text(page, /Welcome back/)).toBeVisible();
  await expect(text(page, /Longest streak 7 days/)).toBeVisible();
  await expect(page.getByRole("listitem", { name: /7-day streak: earned/ })).toBeVisible();
});

test("correcting a no-spend day, then recording the expense, restores the day", async ({ page }) => {
  await signIn(page, "r");
  await open(page, "/progress");
  await panel(page).getByRole("button", { name: "I didn't spend anything today" }).click();
  await panel(page).getByRole("button", { name: "Yes, it's a no-spend day" }).click();
  await expect(panel(page)).toContainText("Checked in today: no-spend day");

  await panel(page).getByRole("button", { name: "Actually, I spent something today" }).click();
  await panel(page).getByRole("button", { name: "Yes, I spent something" }).click();
  await expect(text(page, /No-spend check-in removed/)).toBeVisible();
  await expect(streak(page)).toHaveText("0 days");
  expect(sql(`select status from public.daily_checkins where user_id = '${USERS.r.id}'`)).toBe("needs_review");
  // The first achievement depended only on today's withdrawn check-in.
  expect(count("achievements", "r")).toBe(0);

  await panel(page).getByRole("link", { name: "Add an expense" }).click();
  await page.getByLabel("Amount (₹)").filter({ visible: true }).fill("180");
  await page.getByLabel("Category").filter({ visible: true }).selectOption("food");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page).toHaveURL(/\/spending\?on=/);

  await open(page, "/progress");
  await expect(panel(page)).toContainText("Checked in today: activity recorded or reviewed");
  await expect(streak(page)).toHaveText("1 day");
  expect(count("transactions", "r")).toBe(1);
  expect(count("daily_checkins", "r")).toBe(1);
});

test("a failed save shows an error and a safe retry; a missing sound never blocks the celebration", async ({ page }) => {
  await page.route("**/sounds/milestone.wav", (route) => route.abort());
  let failNext = true;
  await page.route("**/progress", async (route) => {
    if (route.request().method() === "POST" && failNext) {
      failNext = false;
      await route.abort();
    } else await route.continue();
  });
  await signIn(page, "s");
  await open(page, "/progress");
  await panel(page).getByRole("button", { name: "I didn't spend anything today" }).click();
  await panel(page).getByRole("button", { name: "Yes, it's a no-spend day" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("Couldn't reach MoneyMap");
  await expect(text(page, /Check-in complete/)).toHaveCount(0);
  expect(count("daily_checkins", "s")).toBe(0);

  await panel(page).getByRole("alert").getByRole("button", { name: "Try again" }).click();
  await expect(text(page, /Check-in complete! A no-spend day is logged/)).toBeVisible();
  expect(count("daily_checkins", "s")).toBe(1);
  const celebration = page.getByRole("status", { name: "New achievement" });
  await expect(celebration).toContainText("Money Mindful");
  await expect(celebration).toContainText("Sound isn't available on this device right now.");
});

test("sound can be switched off, and stays off", async ({ page }) => {
  const sound = await strictSound(page);
  await signIn(page, "t");
  await open(page, "/progress");
  const toggle = page.getByRole("switch", { name: /Celebration sounds/ });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await open(page, "/progress");
  await expect(page.getByRole("switch", { name: /Celebration sounds: off/ })).toBeVisible();

  await panel(page).getByRole("button", { name: "I didn't spend anything today" }).click();
  await panel(page).getByRole("button", { name: "Yes, it's a no-spend day" }).click();
  await expect(page.getByRole("status", { name: "New achievement" })).toContainText("Money Mindful");
  await page.waitForTimeout(500);
  expect(await sound.plays()).toBe(0);
});

test("saving an entry counts as today's check-in, and other users see nothing of it", async ({ page }) => {
  // User G saved Gmail entries earlier today, so today already counts for them.
  await signIn(page, "g");
  await open(page, "/progress");
  await expect(panel(page)).toContainText("Checked in today: activity recorded or reviewed");

  await signIn(page, "d");
  await open(page, "/progress");
  await expect(text(page, "No check-ins yet")).toBeVisible();
  await expect(page.getByRole("listitem", { name: /: earned/ })).toHaveCount(0);
});

test("Progress fits a 360px phone, and navigation stays consistent", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, "p");
  await open(page, "/progress");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Progress" })).toHaveAttribute("aria-current", "page");
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/progress-360.png`, fullPage: true });

  await open(page, "/subscriptions");
  await expect(nav.getByRole("link", { name: "Commitments" })).toHaveAttribute("aria-current", "page");
  await open(page, "/commitments");
  await expect(page.getByRole("link", { name: /Subscriptions: what they cost/ })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/progress");
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/progress-desktop.png`, fullPage: true });
  await expect(text(page, "Today's check-in")).toBeVisible();
});
