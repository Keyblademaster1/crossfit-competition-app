import { test, expect } from "@playwright/test";
import { logInAs } from "./session";

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

  test("the Google button sends people to Google, to come back to this app", async ({ page }) => {
    // Stopped on the way out: the test only checks where it was going.
    let googleUrl: URL | null = null;
    await page.route("https://accounts.google.com/**", (route) => {
      googleUrl = new URL(route.request().url());
      return route.fulfill({ body: "Google" });
    });

    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect.poll(() => googleUrl?.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3100/api/auth/callback/google",
    );
  });

  test("coming back from Google with a problem shows a plain message", async ({ page }) => {
    await page.goto("/api/auth/callback/google?error=access_denied&state=nothing");
    await expect(page).toHaveURL(/\/login\?/);
    await expect(page.getByText("Logging in with Google did not finish.")).toBeVisible();
  });

  test("someone new names their club, then can log out", async ({ page, context }) => {
    await logInAs(context, { name: "Alex Smith" });

    // Nothing else until they have a club.
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole("heading", { name: "Welcome, Alex" })).toBeVisible();

    await page.getByLabel("What is your club or gym called?").fill("Demo Box");
    await page.getByRole("button", { name: "Start" }).click();

    // A new club starts with no competitions, not someone else's.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Demo Box")).toBeVisible();
    await expect(page.getByText("Nothing yet.")).toBeVisible();

    // Done once: the question does not come back.
    await page.goto("/welcome");
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
