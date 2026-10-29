import { test, expect, type Page } from "@playwright/test";
import { withDatabase } from "./database";
import { slowWhenAsked } from "./slow";

test.beforeEach(async ({ page }, info) => slowWhenAsked(page, info));

/**
 * Every ordinary way an organiser makes a competition and gets it going.
 *
 * Each test is one whole journey, from "Start a new competition" on the home
 * page to a score on the leaderboard, so a step that dead-ends or quietly
 * loses something shows up as the journey not getting there. "Starting" a
 * competition in this app is "Finish setup" on the last step: after that it is
 * no longer a draft, and is run event by event (heats, scores, leaderboard).
 */

const STAMP = Date.now();

// Each journey makes a competition. They are removed afterwards: a club may
// have only 50, and the whole run, at both speeds, would otherwise pass that.
const made: string[] = [];
test.afterEach(async () => {
  if (made.length === 0) return;
  const ids = made.splice(0);
  await withDatabase((db) => db.query(`DELETE FROM "Competition" WHERE id = ANY($1)`, [ids]));
});

/** Opens a new draft from the home page, and returns where it lives. */
async function startSetup(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start a new competition" }).click();
  await expect(page.getByRole("heading", { name: "The basics" })).toBeVisible();
  const setup = page.url().split("?")[0];
  const competition = setup.replace(/\/setup$/, "");
  const id = competition.split("/").pop()!;
  made.push(id);
  return { setup, competition, id };
}

/** Waits for a format save to be through: the next step is covered until then. */
async function settled(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: "Saving…" })).toBeHidden();
}

async function basics(page: Page, name: string) {
  await page.getByLabel("Competition name").fill(name);
  await page.getByLabel("Date").fill("2026-11-14");
  await page.getByLabel("Venue").fill("Skurup");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Format & teams" })).toBeVisible();
  await settled(page);
}

/** On the Format step: picks a format and moves on to the scoring rules. */
async function format(page: Page, card: "Individual" | "Scramble" | "Fixed teams", source?: string) {
  await page.getByText(card, { exact: true }).click();
  await expect(page.getByRole("radio", { name: new RegExp(`^${card}`) })).toBeChecked();
  if (source) await page.getByText(source, { exact: true }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Scoring rules" })).toBeVisible();
  await settled(page);
}

/** On the Events step: builds one event in the event builder and comes back. */
async function buildEvent(page: Page) {
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
  await page.getByRole("link", { name: "Open event builder" }).click();
  await page.getByRole("button", { name: "+ Add event" }).click();
  const blockA = page.getByRole("region", { name: "Block A" });
  for (const [reps, name] of [["21", "Thrusters"], ["21", "Pull-ups"]]) {
    // A block with movements hides its empty line until "+ Movement" opens it.
    const line = blockA.getByLabel("New movement in block A", { exact: true });
    if (!(await line.isVisible())) await blockA.getByRole("button", { name: "+ Movement" }).click();
    await blockA.getByLabel("Reps of the new movement in block A").fill(reps);
    await line.fill(name);
    await blockA.getByRole("button", { name: "+ Movement" }).click();
    await expect(blockA.locator(`input[value="${name}"]`)).toBeVisible();
  }
  // Back to the wizard, where the event now shows with its workout.
  await page.getByRole("link", { name: "← Setup" }).click();
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
  await expect(page.getByText("2 movements")).toBeVisible();
}

/** On the Athletes step: adds one athlete by typing. */
async function typeAthlete(page: Page, name: string, sex: "WOMAN" | "MAN", division?: string) {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("combobox", { name: "Sex", exact: true }).selectOption(sex);
  if (division) await page.getByRole("combobox", { name: "Division" }).selectOption({ label: division });
  await page.getByRole("button", { name: "Add athlete" }).click();
  await expect(page.locator("summary", { hasText: name })).toBeVisible();
}

async function paste(page: Page, list: string) {
  await page.getByText("Paste a list", { exact: true }).click();
  await page.getByLabel("One athlete per line").fill(list);
  await page.getByRole("button", { name: "Add these" }).click();
}

/** From the Sharing step: Finish setup, which lands on the competition. */
async function finish(page: Page, competition: string) {
  await expect(page.getByRole("heading", { name: "Screens & sharing" })).toBeVisible();
  await page.getByRole("button", { name: /Finish setup/ }).click();
  await expect(page).toHaveURL(competition);
  await expect(page.getByText("setup is not finished yet")).toHaveCount(0);
}

/** On an event's score page: types a time into the nth row and leaves it. */
async function enterTime(page: Page, row: number, minutes: string, seconds: string) {
  const rows = page.locator("form").filter({ has: page.getByRole("radio", { name: "Capped" }) });
  await rows.nth(row).getByLabel("Minutes").fill(minutes);
  await rows.nth(row).getByLabel("Seconds").fill(seconds);
  await rows.nth(row).getByLabel("Seconds").blur();
}

async function drawTeams(page: Page) {
  await page.getByRole("link", { name: /Draw teams/ }).first().click();
  await page.getByRole("button", { name: /Draw teams/ }).click();
}

test.describe("making and starting a competition", () => {
  test("an individual competition, from the first step to a score on the leaderboard", async ({ page }) => {
    const name = `Journey Individual ${STAMP}`;
    const { competition } = await startSetup(page);
    await basics(page, name);
    await format(page, "Individual");

    await page.getByText("100 points, even steps").click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await buildEvent(page);

    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Athletes" })).toBeVisible();
    await typeAthlete(page, "Anna", "WOMAN");
    await typeAthlete(page, "Erik", "MAN");
    await paste(page, "Maja, W\nLars, M, 60+");
    await expect(page.getByRole("status")).toHaveText("Added 2 athletes.");
    await expect(page.getByText("4 athletes", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByText("Public leaderboard link").click();
    await finish(page, competition);

    // No longer a draft: the home list shows it with its counts.
    await page.goto("/");
    await expect(page.getByRole("link", { name: new RegExp(`${name}.*4 athletes · 1 events`) })).toBeVisible();
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await expect(page).toHaveURL(competition);

    // On the day: heats for the event, then its scores.
    await page.getByRole("link", { name: /Event 1/ }).click();
    await expect(page.getByText("0 / 4 entered")).toBeVisible();
    await page.getByRole("link", { name: "Heats", exact: true }).click();
    await page.getByRole("button", { name: "Work out the heats" }).click();
    await expect(page.getByRole("navigation", { name: "Heats" })).toBeVisible();
    await page.goto(page.url().replace(/\/heats.*$/, ""));
    // Sorted by name: Anna, Erik, Lars, Maja.
    await enterTime(page, 0, "5", "00");
    await enterTime(page, 1, "6", "30");
    await expect(page.getByText("2 / 4 entered")).toBeVisible();

    await page.goto(`${competition}/leaderboard`);
    await expect(page.getByRole("row", { name: /Anna/ })).toContainText("100");
    // 100 points, even steps: the highest total wins, so the page must not
    // say the opposite.
    await expect.soft(page.getByText("Highest total wins")).toBeVisible();
    await expect.soft(page.getByText("Lowest total wins")).toHaveCount(0);
    // An individual competition with no divisions is one board of everyone,
    // not a board called "No division" (leaderboard.ts says as much).
    await expect.soft(page.getByRole("heading", { name: "No division" })).toHaveCount(0);
  });

  // Individual competitions can have divisions too (Carin, 29 October 2026):
  // each with its own workout, heats and leaderboard.
  test("an individual competition in RX and Scaled runs each division on its own", async ({ page }) => {
    const { competition, id } = await startSetup(page);
    await basics(page, `Journey Divisions ${STAMP}`);
    await page.getByText("Individual", { exact: true }).click();
    await page.getByText("RX and Scaled", { exact: true }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Scoring rules" })).toBeVisible();
    await settled(page);
    await page.getByRole("button", { name: /Continue/ }).click();
    await buildEvent(page);

    // The builder has a version per division: Scaled starts from a copy of
    // RX, with pull-ups swapped for ring rows.
    await page.getByRole("link", { name: "Open event builder" }).click();
    await page.getByRole("link", { name: "Scaled", exact: true }).click();
    await page.getByRole("button", { name: "Copy the RX version" }).click();
    const pullUps = page.getByRole("region", { name: "Block A" }).locator('input[value="Pull-ups"]');
    await pullUps.fill("Ring rows");
    await pullUps.blur();
    await expect
      .poll(() =>
        withDatabase(async (db) =>
          (
            await db.query(
              `SELECT d.name || ': ' || m.name AS line FROM "Movement" m JOIN "Block" b ON b.id = m."blockId"
               JOIN "Division" d ON d.id = b."divisionId" JOIN "Event" e ON e.id = m."eventId"
               WHERE e."competitionId" = $1 ORDER BY d.position, m.position`,
              [id],
            )
          ).rows.map((row) => row.line),
        ),
      )
      .toEqual(["RX: Thrusters", "RX: Pull-ups", "Scaled: Thrusters", "Scaled: Ring rows"]);
    await page.getByRole("link", { name: "← Setup" }).click();
    await page.getByRole("button", { name: /Continue/ }).click();

    // Each athlete is given a division as they are added, or in a list.
    await typeAthlete(page, "Anna", "WOMAN", "RX");
    await typeAthlete(page, "Sara", "WOMAN", "Scaled");
    await paste(page, "Erik, M, RX\nLars, M, Scaled, 60+");
    await expect(page.getByRole("status")).toHaveText("Added 2 athletes.");
    await expect(page.locator("summary", { hasText: "Lars" })).toContainText("Scaled");
    await expect(page.locator("summary", { hasText: "Lars" })).toContainText("60+");

    await page.getByRole("button", { name: /Continue/ }).click();
    await finish(page, competition);

    // Heats keep the divisions apart, as each does its own workout.
    await page.getByRole("link", { name: /Event 1/ }).click();
    await page.getByRole("link", { name: "Heats", exact: true }).click();
    await page.getByRole("button", { name: "Work out the heats" }).click();
    await expect(page.getByRole("navigation", { name: "Heats" })).toBeVisible();
    const mixed = await withDatabase(async (db) =>
      (
        await db.query(
          `SELECT h.id FROM "Heat" h JOIN "Event" e ON e.id = h."eventId" JOIN "Lane" l ON l."heatId" = h.id
           JOIN "Athlete" a ON a.id = l."athleteId" WHERE e."competitionId" = $1
           GROUP BY h.id HAVING COUNT(DISTINCT a."divisionId") > 1`,
          [id],
        )
      ).rowCount,
    );
    expect(mixed).toBe(0);

    await page.goto(`${competition}/leaderboard`);
    await expect(page.getByRole("heading", { name: "RX", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scaled", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No division" })).toHaveCount(0);
  });

  test("divisions can still be added after athletes were signed up without one", async ({ page }) => {
    // Carin's report: "if you don't add a division you can't go back and
    // change it". Athletes added while the competition had no divisions in
    // use must be able to get one once the format changes to one that does.
    const { setup } = await startSetup(page);
    await basics(page, `Journey Late Divisions ${STAMP}`);
    await format(page, "Individual");
    await page.goto(`${setup}?step=4`);
    await typeAthlete(page, "Anna", "WOMAN");
    await typeAthlete(page, "Sara", "WOMAN");

    // Back to Format: fixed teams, drawn once within each division.
    await page.getByRole("button", { name: "2 Format & teams" }).click();
    await page.getByText("Fixed teams", { exact: true }).click();
    await page.getByText("Drawn once", { exact: true }).click();
    await page.getByRole("button", { name: "5 Athletes" }).click();
    await expect(page.getByRole("heading", { name: "Athletes" })).toBeVisible();
    await settled(page);

    // Each one already signed up can be given a division.
    for (const athlete of ["Anna", "Sara"]) {
      await page.locator("summary").getByText(athlete, { exact: true }).click();
      await page.getByLabel(`Division of ${athlete}`).selectOption({ label: "RX" });
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.locator("summary", { hasText: athlete })).toContainText("RX");
    }
    const teams = page.getByRole("region", { name: "Teams" });
    await expect(teams).toContainText("RX: 2 athletes · 1 team of 2");
    await teams.getByRole("button", { name: "Draw teams" }).click();
    await expect(page.getByRole("region", { name: "Team 1", exact: true })).toContainText("Anna");
  });

  test("a scramble competition, set up and run to the leaderboard", async ({ page }) => {
    const { competition } = await startSetup(page);
    await basics(page, `Journey Scramble ${STAMP}`);
    await page.getByText("Scramble", { exact: true }).click();
    await page.getByText("Random", { exact: true }).click();
    await page.getByText("Always different", { exact: true }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Scoring rules" })).toBeVisible();
    await settled(page);
    await page.getByRole("button", { name: /Continue/ }).click();

    // The quick way: name an event on the step, which opens it in the builder.
    await page.getByLabel("Workout name").fill("Chipper");
    await page.getByRole("button", { name: "Add event" }).click();
    await expect(page.getByLabel(/^Event \d+ name$/)).toHaveValue("Chipper");
    const blockA = page.getByRole("region", { name: "Block A" });
    await blockA.getByLabel("Reps of the new movement in block A").fill("50");
    await blockA.getByLabel("New movement in block A", { exact: true }).fill("Wall balls");
    await blockA.getByRole("button", { name: "+ Movement" }).click();
    await expect(blockA.locator('input[value="Wall balls"]')).toBeVisible();
    await page.getByRole("link", { name: "← Setup" }).click();
    await expect(page.getByText("1 movement", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: /Continue/ }).click();
    await paste(page, "Anna, W\nErik, M\nMaja, W\nLars, M");
    await expect(page.getByText("4 athletes", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();
    await finish(page, competition);

    await page.getByRole("link", { name: /Chipper/ }).click();
    await drawTeams(page);
    await expect(page.getByText("Team 2")).toBeVisible();
    await page.getByRole("link", { name: "Scores" }).click();
    await enterTime(page, 0, "7", "00");
    await enterTime(page, 1, "8", "00");
    await expect(page.getByText("2 / 2 entered")).toBeVisible();

    await page.goto(`${competition}/leaderboard`);
    for (const athlete of ["Anna", "Erik", "Maja", "Lars"]) {
      await expect(page.getByRole("row", { name: new RegExp(athlete) })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "No division" })).toHaveCount(0);
  });

  test("fixed teams in RX and Scaled, set up and run to the leaderboard", async ({ page }) => {
    const { competition } = await startSetup(page);
    await basics(page, `Journey Fixed ${STAMP}`);
    await format(page, "Fixed teams", "Chosen at signup");
    await page.getByRole("button", { name: /Continue/ }).click();
    await buildEvent(page);
    await page.getByRole("button", { name: /Continue/ }).click();

    for (const [team, division, members] of [
      ["Iron", "RX", ["Anna", "Maja"]],
      ["Bells", "Scaled", ["Erik", "Lars"]],
    ] as const) {
      await page.getByLabel("Team name").fill(team);
      await page.locator('select[name="newTeamDivisionId"]').selectOption({ label: division });
      await page.getByRole("button", { name: "Add team" }).click();
      const card = page.getByRole("region", { name: team });
      for (const member of members) {
        await page.getByLabel(`New athlete on ${team}`, { exact: true }).fill(member);
        await page
          .getByLabel(`Sex of the new athlete on ${team}`)
          .selectOption(team === "Iron" ? "WOMAN" : "MAN");
        await card.getByRole("button", { name: "Add", exact: true }).click();
        await expect(card).toContainText(member);
      }
      await expect(card).toContainText("2 of 2");
    }

    // Every team is full, so Finish goes straight through.
    await page.getByRole("button", { name: /Continue/ }).click();
    await finish(page, competition);

    await page.getByRole("link", { name: /Event 1/ }).click();
    await expect(page.getByText("0 / 2 entered")).toBeVisible();
    await page.getByRole("link", { name: "Heats", exact: true }).click();
    await page.getByRole("button", { name: "Work out the heats" }).click();
    await expect(page.getByRole("navigation", { name: "Heats" })).toBeVisible();
    await page.goto(page.url().replace(/\/heats.*$/, ""));
    await enterTime(page, 0, "9", "00");
    await enterTime(page, 1, "10", "00");
    await expect(page.getByText("2 / 2 entered")).toBeVisible();

    await page.goto(`${competition}/leaderboard`);
    await expect(page.getByRole("heading", { name: "RX · W/W" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scaled · M/M" })).toBeVisible();
    await expect(page.getByRole("row", { name: /Iron/ })).toContainText("100");
  });

  test("going back and forth between steps after athletes are in loses nothing", async ({ page }) => {
    const { setup, competition } = await startSetup(page);
    await basics(page, `Journey Back And Forth ${STAMP}`);
    // A scramble in teams of three.
    await page.getByText("Scramble", { exact: true }).click();
    await page.getByRole("button", { name: "More per team" }).click();
    await expect(page.getByText("Teams of 3.")).toBeVisible();
    await page.getByText("Best + worst", { exact: true }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await settled(page);
    await page.getByRole("button", { name: /Continue/ }).click();
    await buildEvent(page);
    await page.getByRole("button", { name: /Continue/ }).click();
    await paste(page, "Anna, W, 60+\nErik, M\nMaja, W");
    await expect(page.getByText("3 athletes", { exact: true })).toBeVisible();

    // Change of plan: individual, and placing points.
    await page.getByRole("button", { name: "2 Format & teams" }).click();
    await page.getByText("Individual", { exact: true }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await settled(page);
    await page.getByText("Placing points").click();
    await page.getByRole("button", { name: "5 Athletes" }).click();
    await expect(page.getByText("3 athletes", { exact: true })).toBeVisible();
    await expect(page.locator("summary", { hasText: "Anna" })).toContainText("60+");
    await page.getByRole("button", { name: "4 Events" }).click();
    await expect(page.getByText("2 movements")).toBeVisible();

    // And back to the scramble: the team size and draw chosen before are kept.
    await page.getByRole("button", { name: "2 Format & teams" }).click();
    await page.getByText("Scramble", { exact: true }).click();
    await expect.soft(page.getByText("3 athletes make 1 full teams of 3.")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Best \+ worst/ })).toBeChecked();
    await page.getByRole("button", { name: /Continue/ }).click();
    await settled(page);

    // A reload anywhere shows what was saved.
    await page.reload();
    await expect(page.getByRole("radio", { name: /Placing points/ })).toBeChecked();
    await page.goto(`${setup}?step=1`);
    await expect(page.getByRole("radio", { name: /^Scramble/ })).toBeChecked();

    await page.goto(`${setup}?step=5`);
    await finish(page, competition);
    await expect.soft(page.getByText("Scrambled teams of 3")).toBeVisible();
  });
});

test.describe("every way of starting a competition", () => {
  test("Continue through every step with nothing filled in, then finish", async ({ page }) => {
    const { competition } = await startSetup(page);
    for (const heading of ["Format & teams", "Scoring rules", "Events", "Athletes", "Screens & sharing"]) {
      await page.getByRole("button", { name: /Continue/ }).click();
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    // Finishing with no name and no format should not quietly make a
    // nameless competition of no format: it should ask for them first.
    const answered = page.waitForResponse((r) => r.request().method() === "POST");
    await page.getByRole("button", { name: /Finish setup/ }).click();
    await answered;
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(competition);
  });

  test("a draft is finished from the competition page's Continue setup", async ({ page }) => {
    const { competition } = await startSetup(page);
    await basics(page, `Journey Leave And Return ${STAMP}`);
    await format(page, "Individual");

    // Leave half way through: the competition page says it is not finished.
    await page.getByRole("link", { name: "Leave setup" }).click();
    await expect(page).toHaveURL(competition);
    await page.getByRole("link", { name: "Continue setup" }).click();
    // It picks up at the first thing still to do, not back at the start:
    // the scoring rules come ready-made, so that is the events.
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
  });

  test("a draft opened from the home list can be finished", async ({ page }) => {
    const name = `Journey From The List ${STAMP}`;
    const { competition } = await startSetup(page);
    await basics(page, name);
    await format(page, "Individual");
    await page.goto("/");
    await page.getByRole("link", { name: new RegExp(`${name}.*Setup not finished`) }).click();
    await expect(page.getByRole("heading", { name: "The basics" })).toBeVisible();
    await page.getByRole("button", { name: "6 Screens & sharing" }).click();
    await finish(page, competition);
    await page.goto("/");
    await expect(page.getByRole("link", { name: new RegExp(`${name}.*0 athletes · 0 events`) })).toBeVisible();
  });

  test("a competition started with no athletes says how to add them", async ({ page }) => {
    const { setup, competition } = await startSetup(page);
    await basics(page, `Journey No Athletes ${STAMP}`);
    await format(page, "Individual");
    await page.getByRole("button", { name: /Continue/ }).click();
    await buildEvent(page);
    await page.goto(`${setup}?step=5`);
    await finish(page, competition);

    await page.getByRole("link", { name: /Event 1/ }).click();
    // An individual competition has no teams to add.
    await expect.soft(page.getByText("Add teams on the setup page first.")).toHaveCount(0);
    await expect.soft(page.getByText(/Add athletes/)).toBeVisible();
    await expect.soft(page.getByText("Points each team gets")).toHaveCount(0);
  });

  test("a competition started with no events can have one added and run", async ({ page }) => {
    const { setup, competition } = await startSetup(page);
    await basics(page, `Journey No Events ${STAMP}`);
    await format(page, "Individual");
    await page.goto(`${setup}?step=4`);
    await typeAthlete(page, "Anna", "WOMAN");
    await typeAthlete(page, "Erik", "MAN");
    await page.getByRole("button", { name: /Continue/ }).click();
    await finish(page, competition);

    await page.goto(`${competition}/leaderboard`);
    await expect(page.getByRole("row", { name: /Anna/ })).toBeVisible();

    // An event added afterwards, from the competition page.
    await page.goto(competition);
    await page.getByLabel("Workout name").fill("Late Event");
    await page.getByRole("button", { name: "Add event" }).click();
    await page.getByRole("link", { name: /Late Event/ }).click();
    await expect(page.getByText("0 / 2 entered")).toBeVisible();
  });

  test("finishing without a format asks for one, and then it can be run", async ({ page }) => {
    // Heats are made from the format, so a competition finished without one
    // used to have heats that stayed empty. Finish setup now asks for it.
    const { setup, competition } = await startSetup(page);
    await page.getByLabel("Competition name").fill(`Journey No Format ${STAMP}`);
    await page.goto(`${setup}?step=4`);
    await typeAthlete(page, "Anna", "WOMAN");
    await typeAthlete(page, "Erik", "MAN");
    await page.goto(`${setup}?step=3`);
    await page.getByLabel("Workout name").fill("Formatless");
    await page.getByRole("button", { name: "Add event" }).click();
    await page.goto(`${setup}?step=5`);
    await page.getByRole("button", { name: /Finish setup/ }).click();

    await expect(page.getByRole("heading", { name: "Format & teams" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Choose a format" })).toBeVisible();
    await format(page, "Individual");
    await page.goto(`${setup}?step=5`);
    await finish(page, competition);

    await page.getByRole("link", { name: /Formatless/ }).click();
    await page.getByRole("link", { name: "Heats", exact: true }).click();
    await page.getByRole("button", { name: "Work out the heats" }).click();
    await expect(page.getByRole("navigation", { name: "Heats" })).toBeVisible();
  });

  test("finishing again after going back to setup keeps it started", async ({ page }) => {
    const name = `Journey Finish Twice ${STAMP}`;
    const { setup, competition } = await startSetup(page);
    await basics(page, name);
    await format(page, "Individual");
    await page.goto(`${setup}?step=5`);
    await finish(page, competition);

    await page.getByRole("link", { name: "← Back to setup" }).click();
    await page.getByRole("button", { name: "1 The basics" }).click();
    await page.getByLabel("Venue").fill("Malmö");
    await page.getByRole("button", { name: "6 Screens & sharing" }).click();
    await finish(page, competition);
    await page.goto("/");
    await expect(page.getByRole("link", { name: new RegExp(`${name}.*athletes`) })).toBeVisible();
  });

  test("the browser's back button goes back a step and nothing typed is lost", async ({ page }) => {
    const { setup } = await startSetup(page);
    await basics(page, `Journey Back Button ${STAMP}`);
    await format(page, "Scramble");
    await expect(page).toHaveURL(/step=2$/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${setup}`));
    await expect(page.getByRole("heading", { name: "Format & teams" })).toBeVisible();

    // Wherever it went, what was saved is still there.
    await page.goto(`${setup}?step=0`);
    await expect(page.getByLabel("Competition name")).toHaveValue(`Journey Back Button ${STAMP}`);
  });

  test("a reload part-way through setup keeps the step and what was saved", async ({ page }) => {
    const { setup } = await startSetup(page);
    await basics(page, `Journey Reload ${STAMP}`);
    await format(page, "Scramble");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Scoring rules" })).toBeVisible();
    await page.goto(`${setup}?step=1`);
    await expect(page.getByRole("radio", { name: /^Scramble/ })).toBeChecked();
  });
});
