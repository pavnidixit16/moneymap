import { defineConfig } from "@playwright/test";

// Browser tests run against the local stack started by e2e/local/run.sh.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 360, height: 780 },
    trace: "retain-on-failure",
  },
});
