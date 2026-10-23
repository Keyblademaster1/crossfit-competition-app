import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { testDatabaseUrl } from "./e2e/database";

// The tests need the connection string the same way the app does.
config({ path: ".env.local" });

/**
 * End-to-end tests.
 *
 * These drive a real browser against a real database, because the bugs they
 * exist to catch are ones unit tests cannot see: a button wired to the wrong
 * thing, a form that saves but never moves on. Both have happened.
 *
 * They run against their own schema and their own copy of the app on port
 * 3100, so a dev server you already have open on 3000 is left alone and so is
 * everything in it.
 */
const PORT = 3100;
const DIST = ".next-e2e";
export const LOGGED_IN = "e2e/.auth/organiser.json";

export default defineConfig({
  testDir: "./e2e",
  // A competition is built up step by step, so tests must not race each other
  // against one database.
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    // Signs up a test organiser once; every other test starts logged in as
    // them (see e2e/login.setup.ts).
    { name: "login", testMatch: /\.setup\.ts$/ },
    {
      name: "chromium",
      dependencies: ["login"],
      use: { ...devices["Desktop Chrome"], storageState: LOGGED_IN },
    },
  ],
  webServer: {
    // Builds and runs its own copy, into its own folder and on its own port,
    // so a dev server already open on 3000 keeps working throughout. It also
    // means the tests exercise a production build rather than a dev one.
    // The schema is prepared here rather than in a globalSetup, because that
    // runs after the server is already up — see e2e/prepare.mts.
    command: `node e2e/prepare.mts && npx next build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Never borrow a server that might be pointing at the real database.
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      DATABASE_URL: testDatabaseUrl(),
      NEXT_DIST_DIR: DIST,
      // Signs the login cookies. Only for this throwaway test copy.
      BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-real-0123456789",
    },
  },
});
