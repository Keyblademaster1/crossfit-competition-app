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
import { networkInterfaces, userInfo } from "node:os";

const DATABASE = "holger_comp";
const PORT = Number(process.env.PORT ?? 3000);

/**
 * Where the local database lives.
 *
 * Homebrew's PostgreSQL makes your own account the owner and asks for no
 * password, so the plain form below works as it is. Set LOCAL_DATABASE_URL if
 * yours is set up differently.
 */
function localUrl() {
  return (
    process.env.LOCAL_DATABASE_URL ??
    `postgresql://${userInfo().username}@localhost:5432/${DATABASE}`
  );
}

/** The address other devices on the same network use to reach this laptop. */
function networkAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return null;
}

function checkPostgresIsRunning() {
  try {
    execFileSync("pg_isready", { stdio: "ignore" });
  } catch {
    console.error(
      [
        "PostgreSQL does not seem to be running.",
        "",
        "  Install it once with:  brew install postgresql@17",
        "  Start it with:         brew services start postgresql@17",
      ].join("\n"),
    );
    process.exit(1);
  }
}

function setup() {
  checkPostgresIsRunning();
  const url = localUrl();

  try {
    execFileSync("createdb", [DATABASE], { stdio: "pipe" });
    console.log(`Created the database "${DATABASE}".`);
  } catch (error) {
    const message = String(error.stderr ?? "");
    if (message.includes("already exists")) {
      console.log(`The database "${DATABASE}" is already there.`);
    } else {
      console.error(message || error.message);
      process.exit(1);
    }
  }

  console.log("Creating the tables...");
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: ["ignore", "ignore", "inherit"],
  });

  console.log("\nReady. Start the app with:  npm run dev:local");
}

function dev() {
  checkPostgresIsRunning();
  const url = localUrl();

  // Rebuild the app's description of the database before starting, so it can
  // never begin life out of step with the tables.
  execFileSync("npx", ["prisma", "generate"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: ["ignore", "ignore", "inherit"],
  });

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

  const child = spawn("npx", ["next", "dev", "--port", String(PORT)], {
    env: {
      ...process.env,
      // Handed over directly, so it wins over whatever is in .env.local.
      DATABASE_URL: url,
      // Its own build folder. Next allows only one dev server per folder, so
      // this lets the local one run even if an ordinary one is already open.
      NEXT_DIST_DIR: ".next-local",
    },
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

const command = process.argv[2];
if (command === "setup") setup();
else if (command === "dev") dev();
else {
  console.error("Usage: node scripts/local.mjs setup|dev");
  process.exit(1);
}
