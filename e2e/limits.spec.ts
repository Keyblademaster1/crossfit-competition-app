import { test, expect } from "@playwright/test";
import { withDatabase } from "./database";
import { logInAs } from "./session";

/**
 * The safeguards for the free hosting: a limit stops something being added
 * and says why, and only the listed admin can see the usage page.
 */

const FULL = "e2e-full-competition";

test.describe("limits", () => {
  test("a competition with as many events as allowed takes no more", async ({ page }) => {
    // Thirty events, the most allowed (src/lib/limits.ts), put in directly.
    await withDatabase(async (db) => {
      await db.query(`DELETE FROM "Competition" WHERE id = $1`, [FULL]);
      await db.query(
        `INSERT INTO "Competition" (id, "clubId", name)
         SELECT $1, id, 'Full Throwdown' FROM "Club" WHERE name = 'Test Box' LIMIT 1`,
        [FULL],
      );
      await db.query(
        `INSERT INTO "Event" (id, "competitionId", name, "scoreType", "higherIsBetter", position)
         SELECT $1 || '-' || n, $1, 'Event ' || n, 'TIME', false, n FROM generate_series(1, 30) AS n`,
        [FULL],
      );
    });

    await page.goto(`/competitions/${FULL}`);
    await page.getByLabel("Workout name").fill("One too many");
    await page.getByRole("button", { name: "Add event" }).click();

    await expect(page).toHaveURL(/\/limit\?what=events$/);
    await expect(page.getByText("A competition can have up to 30 events.")).toBeVisible();
    const events = await withDatabase(
      async (db) => (await db.query(`SELECT count(*)::int AS n FROM "Event" WHERE "competitionId" = $1`, [FULL])).rows[0].n,
    );
    expect(events).toBe(30);
  });

  test("the usage page is for the admin only", async ({ page, browser }) => {
    // The organiser the tests run as is not an admin: no link, and no page.
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Usage" })).toHaveCount(0);
    expect((await page.goto("/admin"))?.status()).toBe(404);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await logInAs(context, { name: "Admin", clubName: "Admin Box", email: "admin@example.com" });
    const admin = await context.newPage();
    await admin.goto("/");
    await admin.getByRole("link", { name: "Usage" }).click();
    await expect(admin.getByRole("heading", { name: "Usage" })).toBeVisible();
    await expect(admin.getByText(/of 500 MB free/)).toBeVisible();
    await expect(admin.getByRole("cell", { name: "Test Box" })).toBeVisible();
    await context.close();
  });
});
