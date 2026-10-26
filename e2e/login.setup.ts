import { test as setup, expect } from "@playwright/test";
import { LOGGED_IN } from "../playwright.config";
import { logInAs } from "./session";

/**
 * Logs in the organiser the other tests run as, and saves their login so
 * each test starts logged in.
 */
setup("log in a test organiser", async ({ page, context }) => {
  await logInAs(context, { name: "Organiser", clubName: "Test Box" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await context.storageState({ path: LOGGED_IN });
});
