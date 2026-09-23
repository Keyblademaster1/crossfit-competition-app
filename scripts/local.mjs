#!/usr/bin/env node
/**
 * Running the app on a laptop, with its own database, with no internet.
 *
 * This is how a competition is actually run: the scorekeeper's laptop holds
 * everything, and the TV and any phones reach it over a local network or a
 * phone's hotspot. Nothing depends on a signal, a hosting account or a bill.
 *
 *   npm run db:local    create the database and its tables, once
 *   npm run dev:local   run the app against it
 */

import { execFileSync, spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import pg from "pg";
import { localUrl } from "./local-url.mjs";

const PORT = Number(process.env.PORT ?? 3000);
// Windows runs npx through its shell; elsewhere it is started directly.
const onWindows = process.platform === "win32";

/** The address other devices on the same network use to reach this laptop. */
function networkAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return null;
}

function npx(args, env, options = {}) {
  return { command: "npx", args, options: { env: { ...process.env, ...env }, shell: onWindows, ...options } };
}

/**
 * Connects to PostgreSQL's own "postgres" database on the same server, to
 * check it is running and to create ours. Done here rather than with
 * pg_isready and createdb, which a Windows install does not put on the path.
 */
async function withServer(url, work) {
  const server = new URL(url);
  server.pathname = "/postgres";
  const client = new pg.Client({ connectionString: server.toString() });
  try {
    await client.connect();
  } catch (error) {
    console.error(
      [
        "Could not reach PostgreSQL.",
        `  ${error.message || error.code || "No answer on that address."}`,
        "",
        onWindows
          ? "  Install it from https://www.postgresql.org/download/windows/ and put your\n" +
            "  password in .env.local, as the README says:\n" +
            '  LOCAL_DATABASE_URL="postgresql://postgres:YOUR-PASSWORD@localhost:5432/holger_comp"'
          : "  Install it once with:  brew install postgresql@17\n" +
            "  Start it with:         brew services start postgresql@17",
      ].join("\n"),
    );
    process.exit(1);
  }
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function setup() {
  const url = localUrl();
  const name = decodeURIComponent(new URL(url).pathname.slice(1));

  await withServer(url, async (client) => {
    const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (found.rowCount > 0) {
      console.log(`The database "${name}" is already there.`);
    } else {
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
      console.log(`Created the database "${name}".`);
    }
  });

  console.log("Creating the tables...");
  const run = npx(["prisma", "migrate", "deploy"], { DATABASE_URL: url }, { stdio: ["ignore", "ignore", "inherit"] });
  execFileSync(run.command, run.args, run.options);

  console.log("\nReady. Start the app with:  npm run dev:local");
}

async function dev() {
  const url = localUrl();
  await withServer(url, async () => {});

  // Rebuild the app's description of the database before starting, so it can
  // never begin life out of step with the tables.
  const generate = npx(["prisma", "generate"], { DATABASE_URL: url }, { stdio: ["ignore", "ignore", "inherit"] });
  execFileSync(generate.command, generate.args, generate.options);

  const address = networkAddress();

  console.log("Running against the database on this laptop. No internet needed.\n");
  console.log(`  On this laptop:     http://localhost:${PORT}`);
  if (address) {
    console.log(`  On the same wifi:   http://${address}:${PORT}`);
    console.log("\nOpen the second address on the TV and on any phones.");
    console.log("They must be on the same network or hotspot as this laptop.\n");
  } else {
    console.log("\nNot on a network, so only this laptop can reach it.\n");
  }

  const start = npx(
    ["next", "dev", "--port", String(PORT)],
    {
      // Handed over directly, so it wins over whatever is in .env.local.
      DATABASE_URL: url,
      // Its own build folder. Next allows only one dev server per folder, so
      // this lets the local one run even if an ordinary one is already open.
      NEXT_DIST_DIR: ".next-local",
    },
    { stdio: "inherit" },
  );
  const child = spawn(start.command, start.args, start.options);
  child.on("exit", (code) => process.exit(code ?? 0));
}

const command = process.argv[2];
if (command === "setup") await setup();
else if (command === "dev") await dev();
else {
  console.error("Usage: node scripts/local.mjs setup|dev");
  process.exit(1);
}
