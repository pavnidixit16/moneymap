// Counts backend round trips per page (run with GATEWAY_LOG=1; see e2e/local/run.sh).
// Not part of the regular suite: run with `PERF=1 npm run test:e2e -- e2e/perf`.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { sessionCookie } from "../local/session";

const LOG = "/tmp/moneymap-gateway.log";
const lines = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean);

test("backend round trips per page", async ({ page }) => {
  await page.context().addCookies([{ ...sessionCookie("a"), domain: "localhost", path: "/" }]);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Monthly take-home pay (₹)").fill("80000");
  await page.getByLabel("Spending budget per pay cycle (₹)").fill("20000");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/welcome=1/);

  const report: Record<string, { auth: number; data: number }> = {};
  for (const path of ["/overview", "/commitments", "/spending", "/subscriptions", "/settings"]) {
    const before = lines().length;
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const calls = lines().slice(before);
    report[path] = {
      auth: calls.filter((l) => l.includes("/auth/v1/user")).length,
      data: calls.filter((l) => l.includes("/rest/v1")).length,
    };
  }
  console.log("ROUNDTRIPS " + JSON.stringify(report));
});
