import { test as setup, expect } from "@playwright/test";
import { LOGGED_IN } from "../playwright.config";

/**
 * Signs up the organiser the other tests run as, and saves their login so
 * each test starts logged in rather than signing up again.
 */
setup("sign up a test organiser", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Club or gym name").fill("Test Box");
  await page.getByLabel("Your name").fill("Organiser");
  await page.getByLabel("Email").fill(`organiser-${Date.now()}@example.com`);
  await page.getByLabel(/Password/).fill("a-test-password");
  await page.getByRole("button", { name: "Create club" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await page.context().storageState({ path: LOGGED_IN });
});
