import { test, expect, type Page } from "@playwright/test";

/**
 * Setting up and running a whole competition.
 *
 * This walks the path an organiser actually takes, which is how the two bugs
 * this file was written after were found: Continue did nothing on two steps of
 * the wizard, and Remove did nothing on the athletes step.
 */

const NAME = `E2E ${Date.now()}`;

/**
 * Starts a fresh competition and returns the two urls the tests need:
 * the wizard, and the competition it belongs to. They are different paths,
 * and mixing them up silently lands you on a page that does not exist.
 */
async function startSetup(page: Page): Promise<{ setup: string; competition: string }> {
  await page.goto("/");
  await page.getByRole("button", { name: "Start a new competition" }).click();
  await expect(page.getByRole("heading", { name: "The basics" })).toBeVisible();
  const setup = page.url().split("?")[0];
  return { setup, competition: setup.replace(/\/setup$/, "") };
}

test.describe("setting up a competition", () => {
  test("the wizard saves each step and moves through all six", async ({ page }) => {
    await startSetup(page);

    // Step 1: the basics.
    await page.getByLabel("Competition name").fill(NAME);
    await page.getByLabel("Venue").fill("Skurup");
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 2: scoring rules.
    await expect(page.getByRole("heading", { name: "Scoring rules" })).toBeVisible();
    await page.getByText("Placing points").click();
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 3: format and teams.
    await expect(page.getByRole("heading", { name: "Format & teams" })).toBeVisible();
    await page.getByText("Scramble", { exact: false }).first().click();
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 4: athletes. Continue used to do nothing here.
    await expect(page.getByRole("heading", { name: "Athletes" })).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 5: events. Continue used to do nothing here too.
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 6: sharing.
    await expect(page.getByRole("heading", { name: "Screens & sharing" })).toBeVisible();

    // What was typed on step 1 should still be there on the way back.
    await page.getByRole("button", { name: "1 The basics" }).click();
    await expect(page.getByLabel("Competition name")).toHaveValue(NAME);
    await expect(page.getByLabel("Venue")).toHaveValue("Skurup");
  });

  test("the chosen scoring rule survives leaving and coming back", async ({ page }) => {
    const { setup } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`${NAME} rules`);

    await page.getByRole("button", { name: "2 Scoring rules" }).click();
    await page.getByText("Placing points").click();
    await page.getByRole("button", { name: /Continue/ }).click();

    await page.goto(`${setup}?step=1`);
    await expect(page.getByRole("radio", { name: /Placing points/ })).toBeChecked();
  });

  test("athletes can be added and removed", async ({ page }) => {
    const { setup } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`${NAME} athletes`);
    await page.goto(`${setup}?step=3`);

    for (const name of ["Anna", "Erik"]) {
      await page.getByLabel("Name").fill(name);
      await page.getByRole("button", { name: "Add athlete" }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    // Remove used to do nothing, because the button's name was already
    // being used by React to say which action it was calling.
    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByText("Anna", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Erik", { exact: true })).toBeVisible();
  });

  test("the points ladder shows what each place is worth", async ({ page }) => {
    const { setup } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`${NAME} ladder`);
    await page.goto(`${setup}?step=1`);

    // With no athletes yet it shows a sample of six: 100 down in steps of 16.
    await expect(page.getByText("steps of 16 points")).toBeVisible();
    await expect(page.getByText("100", { exact: true }).first()).toBeVisible();
  });
});

test.describe("running a competition", () => {
  test("a team result becomes points for each athlete", async ({ page }) => {
    const { setup, competition } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`${NAME} run`);
    await page.getByRole("button", { name: /Continue/ }).click();

    // Four athletes, so two teams of two.
    await page.goto(`${setup}?step=3`);
    for (const name of ["Anna", "Erik", "Maja", "Lars"]) {
      await page.getByLabel("Name").fill(name);
      await page.getByRole("button", { name: "Add athlete" }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    // One event, scored on time.
    await page.goto(`${setup}?step=4`);
    await page.getByLabel("Workout name").fill("E2E Event");
    await page.getByRole("button", { name: "Add event" }).click();
    await expect(page.getByText("E2E Event")).toBeVisible();

    await page.getByRole("link", { name: "Leave setup" }).click();
    await page.getByRole("link", { name: /E2E Event/ }).click();

    await page.getByRole("button", { name: /Draw teams/ }).click();
    await expect(page.getByText("Team 1")).toBeVisible();
    await expect(page.getByText("Team 2")).toBeVisible();

    // Score both teams. There is no Save button: it saves on its own.
    const rows = page.locator("form").filter({ has: page.getByRole("radio", { name: "Capped" }) });
    await rows.nth(0).getByLabel("Minutes").fill("5");
    await rows.nth(0).getByLabel("Seconds").fill("00");
    await rows.nth(1).getByLabel("Minutes").fill("6");
    await rows.nth(1).getByLabel("Seconds").fill("30");
    await page.getByRole("heading", { name: "E2E Event" }).click(); // blur, to save

    await expect(page.getByText("2 / 2 entered")).toBeVisible();

    // Four athletes on the leaderboard, two on each team's result.
    await page.goto(`${competition}/screen/leaderboard?show=all`);
    for (const name of ["Anna", "Erik", "Maja", "Lars"]) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    // Both members of the winning team get the winner's points, so the top
    // score appears twice: the whole point of a scrambled competition.
    const topScore = page.getByText("100", { exact: true });
    await expect(topScore).toHaveCount(4); // twice per athlete: event and total
  });

  test("a no-show is recorded without a time", async ({ page }) => {
    const { setup, competition } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`${NAME} noshow`);

    await page.goto(`${setup}?step=3`);
    for (const name of ["Solo", "Partner"]) {
      await page.getByLabel("Name").fill(name);
      await page.getByRole("button", { name: "Add athlete" }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    await page.goto(`${setup}?step=4`);
    await page.getByLabel("Workout name").fill("E2E NoShow");
    await page.getByRole("button", { name: "Add event" }).click();

    await page.getByRole("link", { name: "Leave setup" }).click();
    await page.getByRole("link", { name: /E2E NoShow/ }).click();
    await page.getByRole("button", { name: /Draw teams/ }).click();

    const rows = page.locator("form").filter({ has: page.getByRole("radio", { name: "Capped" }) });
    // The radio itself is hidden inside its label, which is how the
    // Finished / Capped / No-show control is built. Click what a person clicks.
    await rows.nth(0).getByText("No-show").click();
    await expect(page.getByText("no-show · 0 points")).toBeVisible();
  });
});
