import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { testDatabaseUrl, assertIsTestDatabase, TEST_SCHEMA } from "./database.ts";

/**
 * Prepares the test schema: creates it, brings it up to date with the
 * migrations, then empties it so every run starts from nothing.
 *
 * This runs as the first step of starting the test server rather than from
 * Playwright's globalSetup, because globalSetup runs *after* the server is
 * up. A server pointed at a schema with no tables in it answers every request
 * with an error, so Playwright waits for a page that will never come and the
 * run times out before the setup it was waiting on ever happens. It only
 * appeared to work while the schema happened to be up to date already.
 */

// The tests need the connection string the same way the app does.
config({ path: ".env.local" });

const url = testDatabaseUrl();
assertIsTestDatabase(url);

const run = (args: string[], input?: string) =>
  execFileSync("npx", args, {
    input,
    env: { ...process.env, DATABASE_URL: url },
    stdio: input ? ["pipe", "ignore", "inherit"] : ["ignore", "ignore", "inherit"],
  });

console.log(`Preparing the "${TEST_SCHEMA}" schema for the tests...`);

run(["prisma", "db", "execute", "--stdin"], `CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}";`);
run(["prisma", "migrate", "deploy"]);

// Start from an empty competition list every time, so one run cannot depend
// on rows another left behind.
run(
  ["prisma", "db", "execute", "--stdin"],
  `TRUNCATE TABLE
     "${TEST_SCHEMA}"."Score",
     "${TEST_SCHEMA}"."Lane",
     "${TEST_SCHEMA}"."Heat",
     "${TEST_SCHEMA}"."Movement",
     "${TEST_SCHEMA}"."TeamMember",
     "${TEST_SCHEMA}"."Team",
     "${TEST_SCHEMA}"."Event",
     "${TEST_SCHEMA}"."Athlete",
     "${TEST_SCHEMA}"."Division",
     "${TEST_SCHEMA}"."Competition"
   RESTART IDENTITY CASCADE;`,
);

console.log("Ready.");
