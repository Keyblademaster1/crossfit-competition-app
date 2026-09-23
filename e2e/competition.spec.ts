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

    // Step 3: format and teams. Nothing is picked until the organiser picks it,
    // and the draw settings stay out of sight until then.
    await expect(page.getByRole("heading", { name: "Format & teams" })).toBeVisible();
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(page.getByText("How are teams drawn before each event?")).toBeHidden();
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
    await expect(page.getByRole("heading", { name: "Scoring rules" })).toBeVisible();

    const placing = page.getByRole("radio", { name: /Placing points/ });
    await page.getByText("Placing points").click();
    // Check the choice took before moving on. Continuing on an unchecked radio
    // would save the default and fail three steps later, on the assertion at
    // the bottom, which says nothing about which of the two went wrong.
    await expect(placing).toBeChecked();

    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Format & teams" })).toBeVisible();

    await page.goto(`${setup}?step=1`);
    await expect(placing).toBeChecked();
  });

  test("athletes can be added and removed", async ({ page }) => {
    const { setup } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`${NAME} athletes`);
    await page.goto(`${setup}?step=3`);

    for (const name of ["Anna", "Erik"]) {
      await page.getByLabel("Name", { exact: true }).fill(name);
      await page.getByRole("button", { name: "Add athlete" }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    // Remove used to do nothing, because the button's name was already
    // being used by React to say which action it was calling.
    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByText("Anna", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Erik", { exact: true })).toBeVisible();
  });

  test("a forgotten gender can be filled in by clicking the name", async ({ page }) => {
    const { setup } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`${NAME} edit`);
    await page.goto(`${setup}?step=3`);

    await page.getByLabel("Name", { exact: true }).fill("Sara Ek");
    await page.getByRole("button", { name: "Add athlete" }).click();
    await expect(page.locator("summary").getByText("No gender", { exact: true })).toBeVisible();

    // Cancel undoes what was changed, so Continue later saves nothing.
    await page.getByText("Sara Ek", { exact: true }).click();
    await page.getByLabel("Gender of Sara Ek").selectOption("MAN");
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "4 Athletes" }).click();
    await expect(page.locator("summary").getByText("No gender", { exact: true })).toBeVisible();

    await page.getByText("Sara Ek", { exact: true }).click();
    await page.getByLabel("Gender of Sara Ek").selectOption("WOMAN");
    await page.getByLabel("Name of Sara Ek").fill("Sara Eklund");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Sara Eklund", { exact: true })).toBeVisible();
    await expect(page.locator("summary").getByText("No gender", { exact: true })).toHaveCount(0);
    await expect(page.locator("summary").getByText("W", { exact: true })).toBeVisible();
  });

  test("a pasted list adds everyone once", async ({ page }) => {
    const { setup } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`${NAME} paste`);
    await page.goto(`${setup}?step=3`);

    const paste = async (list: string) => {
      await page.getByText("Paste a list").click();
      await page.getByLabel("One athlete per line").fill(list);
      await page.getByRole("button", { name: "Add these" }).click();
    };

    await paste("Anna Lindqvist, W, 60+\nJonas Lind\tM\nEva Berg");
    await expect(page.getByRole("status")).toHaveText("Added 3 athletes.");
    await expect(page.getByText("3 athletes", { exact: true })).toBeVisible();
    const anna = page.locator("summary", { hasText: "Anna Lindqvist" });
    await expect(anna.getByText("60+", { exact: true })).toBeVisible();
    await expect(anna.getByText("W", { exact: true })).toBeVisible();

    // The same list again, as happens when somebody is not sure it worked.
    await paste("Anna Lindqvist\nJonas Lind\nEva Berg\nSara Ek");
    await expect(page.getByRole("status")).toHaveText(
      "Added 1 athlete. 3 were already on the list.",
    );
    await expect(page.getByText("4 athletes", { exact: true })).toBeVisible();

    // Changing your mind: Escape closes the box and forgets what was in it,
    // so Continue afterwards adds nobody.
    await page.getByText("Paste a list").click();
    await page.getByLabel("One athlete per line").fill("Nobody Real");
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("One athlete per line")).toBeHidden();
    await page.getByRole("button", { name: "4 Athletes" }).click();
    await expect(page.getByText("4 athletes", { exact: true })).toBeVisible();
  });

  test("teams chosen at signup get names and members", async ({ page }) => {
    const { setup } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`${NAME} signup teams`);
    await page.getByRole("button", { name: "3 Format & teams" }).click();
    await page.getByText("Fixed teams").first().click();
    // The follow-up question appears as soon as the card is picked, with
    // nothing chosen for you.
    const signup = page.getByRole("radio", { name: /Chosen at signup/ });
    await expect(signup).not.toBeChecked();
    await expect(page.getByText("How are teams drawn before each event?")).toBeHidden();
    await page.getByText("Chosen at signup").click();
    await page.getByRole("button", { name: /Continue/ }).click();

    await page.getByLabel("Team name").fill("Järnladies");
    await page.getByRole("button", { name: "Add team" }).click();
    const team = page.getByRole("region", { name: "Järnladies" });
    await expect(team).toContainText("0 of 2");

    // Straight onto the team, from its own card.
    await page.getByLabel("New athlete on Järnladies", { exact: true }).fill("Anna Lindqvist");
    await team.getByRole("button", { name: "Add", exact: true }).click();
    await expect(team).toContainText("Anna Lindqvist");
    await expect(team).toContainText("1 of 2");

    // Pasted athletes wait until they are put on a team.
    await page.getByText("Paste a list").click();
    await page.getByLabel("One athlete per line").fill("Eva Berg, W, 60+");
    await page.getByRole("button", { name: "Add these" }).click();
    const loose = page.getByRole("region", { name: "Not on a team yet" });
    await expect(loose).toContainText("Eva Berg");

    await page.getByLabel("Team for Eva Berg").selectOption({ label: "Järnladies" });
    await page.getByRole("button", { name: "Put on team" }).click();
    await expect(team).toContainText("Eva Berg");
    await expect(team).toContainText("2 of 2");
    await expect(loose).toHaveCount(0);

    // Taking someone off keeps them, back in the waiting list.
    await team.getByRole("button", { name: "Take off team" }).first().click();
    await expect(team).toContainText("1 of 2");
    await expect(loose).toContainText("Anna Lindqvist");
  });

  test("an event is built from blocks, and scored from them", async ({ page }) => {
    const { competition } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`${NAME} blocks`);
    await page.getByRole("button", { name: /Continue/ }).click();
    await chooseScramble(page, `${competition}/setup`);

    await page.goto(`${competition}/events`);
    await page.getByRole("button", { name: "+ Add event" }).click();
    // A new event starts as one "for time" block.
    const blockA = page.getByRole("region", { name: "Block A" });
    await expect(blockA.getByLabel("Block format")).toHaveValue("FOR_TIME");

    await blockA.getByLabel("Reps of the new movement in block A").fill("100");
    await blockA.getByLabel("New movement in block A", { exact: true }).fill("Double-unders");
    await blockA.getByRole("button", { name: "+ Movement" }).click();
    await expect(blockA.locator('input[value="Double-unders"]')).toBeVisible();

    // A menu keeps what was picked. It used to jump back to Barbell once the
    // row saved, and the next save — here, the reps — wrote Barbell over it.
    const row = blockA.locator("form", { has: page.locator('input[value="Double-unders"]') });
    // Nothing says "Saved" any more, so wait for the saves to reach the app.
    let saved = page.waitForResponse((r) => r.request().method() === "POST");
    await row.getByLabel("What it is done on").selectOption("JUMP_ROPE");
    await saved;
    saved = page.waitForResponse((r) => r.request().method() === "POST");
    await blockA.getByLabel("How the team splits the work").selectOption("SYNCHRO");
    await saved;
    await row.getByLabel("Reps").fill("90");
    await row.getByLabel("Reps").blur();
    await expect(row.getByLabel("What it is done on")).toHaveValue("JUMP_ROPE");
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(row.getByLabel("What it is done on")).toHaveValue("JUMP_ROPE");
    await expect(row.getByLabel("Reps")).toHaveValue("90");
    await expect(blockA.getByLabel("How the team splits the work")).toHaveValue("SYNCHRO");
    await row.getByLabel("Reps").fill("100");
    await row.getByLabel("Reps").blur();
    await expect(page.getByText("100 reps · both at the same time")).toBeVisible();

    await page.getByRole("button", { name: "+ AMRAP" }).click();
    const blockB = page.getByRole("region", { name: "Block B" });
    for (const [reps, name] of [["10", "Thrusters"], ["10", "Burpees over bar"]]) {
      await blockB.getByLabel("Reps of the new movement in block B").fill(reps);
      await blockB.getByLabel("New movement in block B", { exact: true }).fill(name);
      await blockB.getByRole("button", { name: "+ Movement" }).click();
      await expect(blockB.locator(`input[value="${name}"]`)).toBeVisible();
    }
    await expect(blockB).toContainText("20 reps per round · 12 minutes");
    await expect(page.getByText("120 reps in total")).toBeVisible();
    await expect(page.getByText("Scored: time, or reps at the cap")).toBeVisible();

    // Take away the for-time block and a lone AMRAP is left: rounds and reps.
    await page.getByRole("button", { name: "Remove block A" }).click();
    await expect(page.getByText("Scored: rounds and reps")).toBeVisible();
    await expect(page.getByText("20 reps in total")).toBeVisible();
  });

  test("fixed teams build an RX and a Scaled version", async ({ page }) => {
    const { competition } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`${NAME} rx scaled`);
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.goto(`${competition}/setup?step=2`);
    await page.getByText("Fixed teams").first().click();
    await page.getByText("Chosen at signup").click();
    await page.getByRole("button", { name: /Continue/ }).click();

    await page.goto(`${competition}/events`);
    await page.getByRole("button", { name: "+ Add event" }).click();
    const divisions = page.getByRole("navigation", { name: "Division" });
    await expect(divisions.getByRole("link", { name: "RX" })).toHaveAttribute("aria-current", "page");
    // No 60+ in fixed teams.
    await expect(page.getByText("60+ man")).toHaveCount(0);

    const blockA = page.getByRole("region", { name: "Block A" });
    await blockA.getByLabel("Reps of the new movement in block A").fill("10");
    await blockA.getByLabel("New movement in block A", { exact: true }).fill("Pull-ups");
    await blockA.getByRole("button", { name: "+ Movement" }).click();
    await expect(blockA.locator('input[value="Pull-ups"]')).toBeVisible();

    // Scaled starts empty, and can start from a copy of RX.
    await divisions.getByRole("link", { name: "Scaled" }).click();
    await expect(page.getByRole("region", { name: "Block A" })).toHaveCount(0);
    await page.getByRole("button", { name: "Copy the RX version" }).click();
    const scaledRow = page.getByRole("region", { name: "Block A" }).locator('input[value="Pull-ups"]');
    await expect(scaledRow).toBeVisible();

    // Changing Scaled leaves RX alone.
    const renamed = page.waitForResponse((r) => r.request().method() === "POST");
    await scaledRow.fill("Ring rows");
    await scaledRow.blur();
    await renamed;
    await divisions.getByRole("link", { name: "RX" }).click();
    await expect(page.getByRole("region", { name: "Block A" }).locator('input[value="Pull-ups"]')).toBeVisible();
    await divisions.getByRole("link", { name: "Scaled" }).click();
    await expect(page.getByRole("region", { name: "Block A" }).locator('input[value="Ring rows"]')).toBeVisible();
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

/**
 * Draw the teams for the event being looked at.
 *
 * Two steps: the event screens link to the draw screen, and the draw itself
 * happens when the button there is pressed.
 */
async function drawTeams(page: Page) {
  await page.getByRole("link", { name: /Draw teams/ }).first().click();
  await page.getByRole("button", { name: /Draw teams/ }).click();
}

/**
 * Picks Scramble on the Format step. Nothing is chosen for a new competition,
 * so a test that needs teams drawn has to choose it, as an organiser would.
 */
async function chooseScramble(page: Page, setup: string) {
  await page.goto(`${setup}?step=2`);
  await page.getByText("Scramble", { exact: true }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Athletes" })).toBeVisible();
}

test.describe("running a competition", () => {
  test("a team result becomes points for each athlete", async ({ page }) => {
    const { setup, competition } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`${NAME} run`);
    await page.getByRole("button", { name: /Continue/ }).click();
    await chooseScramble(page, setup);

    // Four athletes, so two teams of two.
    await page.goto(`${setup}?step=3`);
    for (const name of ["Anna", "Erik", "Maja", "Lars"]) {
      await page.getByLabel("Name", { exact: true }).fill(name);
      await page.getByRole("button", { name: "Add athlete" }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    // One event, scored on time.
    await page.goto(`${setup}?step=4`);
    await page.getByLabel("Workout name").fill("E2E Event");
    await page.getByRole("button", { name: "Add event" }).click();
    // Adding an event goes straight on to writing out its workout.
    await expect(page.getByRole("link", { name: "← Setup" })).toBeVisible();
    await expect(page.getByLabel(/^Event \d+ name$/)).toHaveValue("E2E Event");

    await page.goto(competition);
    await page.getByRole("link", { name: /E2E Event/ }).click();

    // Drawing the teams is two steps now: a link to the draw screen, then the
    // button there that actually draws them.
    await drawTeams(page);
    await expect(page.getByText("Team 1")).toBeVisible();
    await expect(page.getByText("Team 2")).toBeVisible();

    // Back to the scores, which is where the results are typed in.
    await page.getByRole("link", { name: "Scores" }).click();

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
    await page.getByRole("button", { name: /Continue/ }).click();
    await chooseScramble(page, setup);

    await page.goto(`${setup}?step=3`);
    for (const name of ["Solo", "Partner"]) {
      await page.getByLabel("Name", { exact: true }).fill(name);
      await page.getByRole("button", { name: "Add athlete" }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    await page.goto(`${setup}?step=4`);
    await page.getByLabel("Workout name").fill("E2E NoShow");
    await page.getByRole("button", { name: "Add event" }).click();
    await expect(page.getByRole("link", { name: "← Setup" })).toBeVisible();

    await page.goto(competition);
    await page.getByRole("link", { name: /E2E NoShow/ }).click();
    await drawTeams(page);
    await page.getByRole("link", { name: "Scores" }).click();

    const rows = page.locator("form").filter({ has: page.getByRole("radio", { name: "Capped" }) });
    // The radio itself is hidden inside its label, which is how the
    // Finished / Capped / No-show control is built. Click what a person clicks.
    await rows.nth(0).getByText("No-show").click();
    await expect(page.getByText("no-show · 0 points")).toBeVisible();
  });
});
