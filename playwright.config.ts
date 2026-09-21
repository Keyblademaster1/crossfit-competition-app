import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests.
 *
 * These drive a real browser against a real database, because the bugs they
 * exist to catch are ones unit tests cannot see: a button wired to the wrong
 * thing, a form that saves but never moves on. Both have happened.
 *
 * They run against whatever DATABASE_URL points at, and each test creates its
 * own competition named "E2E ..." so runs do not tread on each other. The
 * teardown removes them afterwards.
 */
export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/teardown.ts",
  // A competition is built up step by step, so the tests within a file must
  // run in order and must not race each other against one database.
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
