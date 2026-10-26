import { test, expect } from "@playwright/test";

/**
 * A competition whose setup is not finished is a draft, and opening it from
 * the list goes back into setup, not to the competition page.
 */
test("a draft opens back into setup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start a new competition" }).click();
  await expect(page).toHaveURL(/\/setup\?step=0$/);

  await page.goto("/");
  const draft = page.getByRole("link", { name: /Untitled draft.*Setup not finished/ }).first();
  await draft.click();
  await expect(page).toHaveURL(/\/competitions\/[^/]+\/setup$/);
  await expect(page.getByRole("heading", { name: /The basics/i })).toBeVisible();
});
