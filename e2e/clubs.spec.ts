import { test, expect } from "@playwright/test";
import { config } from "dotenv";
import { withDatabase } from "./database";

/**
 * One club cannot see or change another club's competitions.
 *
 * Another club's competition is put straight into the database, then reached
 * for every way an outsider could: from the list, by its address, by its
 * spreadsheet download, and by sending a real form with its id swapped in.
 * Each must come back "not found" and leave it untouched.
 */

config({ path: ".env.local" });

const THEIRS = "e2e-other-club-competition";
const THEIR_NAME = "Another club's competition";

test.describe("clubs", () => {
  // The tests run logged in as the organiser of one club (login.setup.ts);
  // this is another club's competition, put in behind the app's back.
  test.beforeAll(async () => {
    await withDatabase(async (db) => {
      await db.query(`DELETE FROM "Competition" WHERE id = $1`, [THEIRS]);
      await db.query(
        `INSERT INTO "Club" (id, name) VALUES ('e2e-other-club', 'Another club') ON CONFLICT (id) DO NOTHING`,
      );
      await db.query(`INSERT INTO "Competition" (id, "clubId", name) VALUES ($1, 'e2e-other-club', $2)`, [
        THEIRS,
        THEIR_NAME,
      ]);
    });
  });

  const theirName = () =>
    withDatabase(async (db) => (await db.query(`SELECT name FROM "Competition" WHERE id = $1`, [THEIRS])).rows[0]?.name);

  test("another club's competition is not in the list", async ({ page }) => {
    expect(await theirName()).toBe(THEIR_NAME);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Competitions", exact: true })).toBeVisible();
    await expect(page.getByText(THEIR_NAME)).toHaveCount(0);
  });

  test("its pages and download are not found", async ({ page, request }) => {
    // It is there, so "not found" means kept out, not missing.
    expect(await theirName()).toBe(THEIR_NAME);
    for (const path of ["", "/setup?step=0", "/leaderboard", "/events", "/results", "/screen/leaderboard"]) {
      const response = await page.goto(`/competitions/${THEIRS}${path}`);
      expect(response?.status(), path || "/").toBe(404);
      await expect(page.getByText(THEIR_NAME)).toHaveCount(0);
    }
    const download = await request.get(`/competitions/${THEIRS}/results/export`);
    expect(download.status()).toBe(404);
  });

  test("a form sent with its id swapped in changes nothing", async ({ page }) => {
    // Our own new competition's first step, with the hidden competition id
    // changed to theirs before sending: what a curious outsider would try.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new competition" }).click();
    await expect(page.getByRole("heading", { name: "The basics" })).toBeVisible();
    await page.getByLabel("Competition name").fill("Taken over");
    await page.evaluate((theirs) => {
      for (const input of document.querySelectorAll<HTMLInputElement>('input[name="competitionId"]')) {
        input.value = theirs;
      }
    }, THEIRS);
    await page.getByRole("button", { name: /Continue/ }).click();

    // The step is saved in the background, and the save is refused.
    await expect(page.getByRole("alert").filter({ hasText: "could not be saved" })).toBeVisible();
    expect(await theirName()).toBe(THEIR_NAME);
  });
});
