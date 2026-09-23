/**
 * Which database "on this laptop" means, for the local scripts.
 *
 * In order: LOCAL_DATABASE_URL set in the shell, then LOCAL_DATABASE_URL in
 * .env.local, then the Mac default — Homebrew's PostgreSQL makes your own
 * account the owner and asks for no password. On Windows the installer makes
 * a "postgres" user with a password instead, so there the line goes in
 * .env.local (see the README).
 *
 * Only LOCAL_DATABASE_URL is read from the file. A DATABASE_URL there points
 * at a hosted database, and the local scripts must never touch that one: the
 * demo script deletes and rebuilds its competition.
 */
import { readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { parse } from "dotenv";

export const DATABASE = "holger_comp";

export function localUrl() {
  if (process.env.LOCAL_DATABASE_URL) return process.env.LOCAL_DATABASE_URL;
  try {
    const fromFile = parse(readFileSync(".env.local")).LOCAL_DATABASE_URL;
    if (fromFile) return fromFile;
  } catch {
    // No .env.local: the default is fine.
  }
  return `postgresql://${userInfo().username}@localhost:5432/${DATABASE}`;
}
