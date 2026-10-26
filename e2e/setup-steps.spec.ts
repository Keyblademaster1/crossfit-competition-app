import { test, expect } from "@playwright/test";
import { slowWhenAsked } from "./slow";

test.beforeEach(async ({ page }, info) => slowWhenAsked(page, info));

/**
 * Moving between setup steps happens in the browser, without waiting for the
 * server, and what changed on a step is still saved (setup-wizard.tsx).
 */
test.describe("moving between setup steps", () => {
  test("an unchanged step is left without asking the server anything", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new competition" }).click();
    await expect(page.getByRole("heading", { name: "The basics" })).toBeVisible();

    const sent: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") sent.push(request.url());
    });
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Format & teams" })).toBeVisible();
    await expect(page).toHaveURL(/\?step=1$/);
    await page.getByRole("button", { name: /Back/ }).click();
    await expect(page.getByRole("heading", { name: "The basics" })).toBeVisible();
    expect(sent).toEqual([]);
  });

  test("what changed is saved on the way, while the next step already shows", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new competition" }).click();
    await page.getByLabel("Competition name").fill("Saved Behind The Scenes");
    await page.getByLabel("Venue").fill("Lund");

    const saved = page.waitForResponse((response) => response.request().method() === "POST");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Format & teams" })).toBeVisible();
    await saved;

    // The name at the top is read again once the save is through.
    await expect(page.getByText("Saved Behind The Scenes").first()).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "1 The basics" }).click();
    await expect(page.getByLabel("Competition name")).toHaveValue("Saved Behind The Scenes");
    await expect(page.getByLabel("Venue")).toHaveValue("Lund");
  });

  test("an athlete typed in but not yet added is added on Continue", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new competition" }).click();
    await page.getByRole("button", { name: "5 Athletes" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Greta");
    await page.getByRole("combobox", { name: "Sex", exact: true }).selectOption("WOMAN");
    await page.getByRole("button", { name: /Continue/ }).click();

    await expect(page.getByRole("heading", { name: "Screens & sharing" })).toBeVisible();
    await page.getByRole("button", { name: "5 Athletes" }).click();
    await expect(page.getByText("Greta", { exact: true })).toBeVisible();
  });
});
