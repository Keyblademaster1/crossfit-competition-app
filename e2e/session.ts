import { createHmac, randomBytes } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { config } from "dotenv";
import { withDatabase } from "./database";

/**
 * Logging a test in without Google.
 *
 * People log in by going to Google and back, which a test cannot do. So a
 * test makes the account and its login straight in the test database, and
 * hands the browser the same signed cookie Better Auth would have set. From
 * there on the app treats it like anyone else logged in.
 */

config({ path: ".env.local" });

/** Signs the login cookies. Only for the throwaway copy the tests run. */
export const TEST_AUTH_SECRET = "e2e-only-secret-not-used-anywhere-real-0123456789";

/**
 * Logs the browser in as a new person, with a new club of the given name, or
 * with none, as on their first ever login.
 */
export async function logInAs(
  context: BrowserContext,
  who: { name: string; clubName?: string; email?: string },
) {
  const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
  const userId = `e2e-user-${stamp}`;
  const token = randomBytes(24).toString("hex");

  await withDatabase(async (db) => {
    let clubId: string | null = null;
    if (who.clubName) {
      clubId = `e2e-club-${stamp}`;
      await db.query(`INSERT INTO "Club" (id, name) VALUES ($1, $2)`, [clubId, who.clubName]);
    }
    await db.query(
      `INSERT INTO "User" (id, name, email, "emailVerified", "clubId") VALUES ($1, $2, $3, true, $4)`,
      [userId, who.name, who.email ?? `${userId}@example.com`, clubId],
    );
    await db.query(
      `INSERT INTO "Session" (id, token, "expiresAt", "userId", "updatedAt")
       VALUES ($1, $2, now() + interval '7 days', $3, now())`,
      [`e2e-session-${stamp}`, token, userId],
    );
  });

  // Better Auth's own format: the token, a dot, then its signature.
  const signature = createHmac("sha256", TEST_AUTH_SECRET).update(token).digest("base64");
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: encodeURIComponent(`${token}.${signature}`),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
