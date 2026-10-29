import { test as setup, expect } from "@playwright/test";
import { LOGGED_IN } from "../playwright.config";
import { logInAs } from "./session";
import { withDatabase } from "./database";

/**
 * Logs in the organiser the other tests run as, and saves their login so
 * each test starts logged in.
 */
setup("log in a test organiser", async ({ page, context }) => {
  // Every run starts the club empty. The tests make a competition each, and
  // left to pile up from run to run they reach the club's limit of 50, after
  // which every new one is refused ("That is the limit").
  await withDatabase((db) =>
    db.query(`DELETE FROM "Competition" WHERE "clubId" IN (SELECT id FROM "Club" WHERE name = 'Test Box')`),
  );
  await logInAs(context, { name: "Organiser", clubName: "Test Box" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await context.storageState({ path: LOGGED_IN });
});
