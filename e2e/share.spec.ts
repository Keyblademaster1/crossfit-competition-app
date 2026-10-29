import { test, expect } from "@playwright/test";
import { withDatabase } from "./database";

/**
 * Share links: switched on in setup, they let anyone watch the leaderboard
 * and the TV screens without logging in, and switched off they stop working.
 */

const ID = "e2e-shared-competition";
const NAME = "Shared Throwdown";

test.describe("share links", () => {
  // A competition in the logged-in organiser's own club (login.setup.ts).
  test.beforeAll(async () => {
    await withDatabase(async (db) => {
      await db.query(`DELETE FROM "Competition" WHERE id = $1`, [ID]);
      await db.query(
        // A format, or Finish setup asks for one first.
        `INSERT INTO "Competition" (id, "clubId", name, mode)
         SELECT $1, id, $2, 'INDIVIDUAL' FROM "Club" WHERE name = 'Test Box' LIMIT 1`,
        [ID, NAME],
      );
    });
  });

  test("a link switched on works without a login, and switched off stops", async ({ page, browser }) => {
    await page.goto(`/competitions/${ID}/setup?step=5`);
    await page.getByText("Public leaderboard link").click();
    await page.getByRole("button", { name: /Finish setup/ }).click();
    await expect(page).toHaveURL(new RegExp(`/competitions/${ID}$`));

    const link = page.getByRole("link", { name: /\/share\/[\w-]{22}$/ });
    await expect(link).toBeVisible();
    const shared = (await link.textContent())!;

    // Someone with no login at all.
    const stranger = await browser.newPage({ storageState: { cookies: [], origins: [] } });
    await stranger.goto(shared);
    await expect(stranger.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
    await expect(stranger.getByText(NAME)).toBeVisible();
    // Nothing leads them into the organiser's pages.
    await expect(stranger.locator(`a[href^="/competitions"]`)).toHaveCount(0);

    for (const screen of ["screen/leaderboard", "screen/workout"]) {
      const response = await stranger.goto(`${shared}/${screen}`);
      expect(response?.status()).toBe(200);
      await expect(stranger.getByText(/back to setup|^setup$/i)).toHaveCount(0);
    }

    // A made-up code finds nothing.
    expect((await stranger.goto(shared.replace(/[\w-]{22}$/, "x".repeat(22))))?.status()).toBe(404);

    // Switched off, the same link is "not found".
    await page.goto(`/competitions/${ID}/setup?step=5`);
    await page.getByText("Public leaderboard link").click();
    await page.getByRole("button", { name: /Finish setup/ }).click();
    await expect(page).toHaveURL(new RegExp(`/competitions/${ID}$`));
    await expect(page.getByRole("link", { name: /\/share\// })).toHaveCount(0);
    expect((await stranger.goto(shared))?.status()).toBe(404);

    // Back on, it is the same link as before.
    await page.goto(`/competitions/${ID}/setup?step=5`);
    await page.getByText("Public leaderboard link").click();
    await page.getByRole("button", { name: /Finish setup/ }).click();
    await expect(page.getByRole("link", { name: shared }).first()).toBeVisible();
    expect((await stranger.goto(shared))?.status()).toBe(200);
  });
});
