import { test, expect } from "@playwright/test";

/**
 * Logging in and out, starting each time from a browser nobody is logged in
 * on.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("logins", () => {
  test("someone not logged in is sent to the login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  });

  test("signing up makes a club, and its organiser can log out and back in", async ({ page }) => {
    const email = `alex-${Date.now()}@example.com`;
    await page.goto("/signup");
    await page.getByLabel("Club or gym name").fill("Demo Box");
    await page.getByLabel("Your name").fill("Alex");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/Password/).fill("a-good-password");
    await page.getByRole("button", { name: "Create club" }).click();

    // A new club starts with no competitions, not someone else's.
    await expect(page.getByText("Demo Box")).toBeVisible();
    await expect(page.getByText("Nothing yet.")).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("That email and password do not match.")).toBeVisible();

    await page.getByLabel("Password").fill("a-good-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Demo Box")).toBeVisible();
  });

  test("the same email cannot sign up twice", async ({ page }) => {
    const email = `twice-${Date.now()}@example.com`;
    for (const attempt of [1, 2]) {
      await page.goto("/signup");
      await page.getByLabel("Club or gym name").fill(`Box ${attempt}`);
      await page.getByLabel("Your name").fill("Sam");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel(/Password/).fill("a-good-password");
      await page.getByRole("button", { name: "Create club" }).click();
      if (attempt === 1) {
        await page.getByRole("button", { name: "Log out" }).click();
        await expect(page).toHaveURL(/\/login$/);
      }
    }
    await expect(page.getByText(/already an account/)).toBeVisible();
  });
});
