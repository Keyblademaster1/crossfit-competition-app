import { execFileSync } from "node:child_process";
import { testDatabaseUrl, assertIsTestDatabase, TEST_SCHEMA } from "./database";

/**
 * Prepares the test schema before anything runs: creates the tables if they
 * are not there, then empties them so every run starts from nothing.
 */
export default function globalSetup() {
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
       "${TEST_SCHEMA}"."TeamMember",
       "${TEST_SCHEMA}"."Team",
       "${TEST_SCHEMA}"."Event",
       "${TEST_SCHEMA}"."Athlete",
       "${TEST_SCHEMA}"."Division",
       "${TEST_SCHEMA}"."Competition"
     RESTART IDENTITY CASCADE;`,
  );
}
