import { execFileSync } from "node:child_process";

/**
 * Removes the competitions the tests created.
 *
 * Done in SQL rather than through the app, because the app has no delete and
 * the tests should not need one. Everything else belonging to a competition
 * goes with it, since the database is set up to cascade.
 */
export default function teardown() {
  try {
    execFileSync("npx", ["prisma", "db", "execute", "--stdin"], {
      input: `DELETE FROM "Competition" WHERE "name" LIKE 'E2E %';`,
      stdio: ["pipe", "ignore", "inherit"],
    });
  } catch {
    // A failed clean-up should not fail the run; it only leaves rows behind.
    console.warn("Could not clean up E2E competitions.");
  }
}
