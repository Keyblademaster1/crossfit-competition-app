import { test, expect, type Page } from "@playwright/test";
import { withDatabase } from "./database";
import { slowWhenAsked } from "./slow";

test.beforeEach(async ({ page }, info) => slowWhenAsked(page, info));

/**
 * Every scoring choice, followed through to the leaderboard: the two points
 * systems, the three tie rules, each kind of score, and the heat orders.
 *
 * The athletes and events are put straight into the database, since adding
 * them has tests of its own. Everything that is being checked is done on
 * screen: the rules are chosen on the Scoring rules step, the results typed
 * into the score page, and the answer read off the leaderboard.
 */

const STAMP = Date.now();

const made: string[] = [];
test.afterEach(async () => {
  if (made.length === 0) return;
  const ids = made.splice(0);
  await withDatabase((db) => db.query(`DELETE FROM "Competition" WHERE id = ANY($1)`, [ids]));
});

interface SeedEvent {
  name: string;
  scoreType: "TIME" | "TIME_OR_REPS" | "REPS" | "ROUNDS_REPS" | "WEIGHT";
  higherIsBetter: boolean;
  timeCapSeconds?: number;
  repsPerRound?: number;
}

/** An individual competition, already set up, with these athletes and events. */
async function individual(name: string, athletes: string[], events: SeedEvent[]) {
  const id = `e2e-scoring-${STAMP}-${made.length}-${Math.random().toString(36).slice(2, 7)}`;
  made.push(id);
  await withDatabase(async (db) => {
    await db.query(
      `INSERT INTO "Competition" (id, "clubId", name, mode)
       SELECT $1, id, $2, 'INDIVIDUAL' FROM "Club" WHERE name = 'Test Box' LIMIT 1`,
      [id, `${name} ${STAMP}`],
    );
    for (const [index, athlete] of athletes.entries()) {
      await db.query(
        `INSERT INTO "Athlete" (id, "competitionId", name, gender) VALUES ($1, $2, $3, $4)`,
        [`${id}-a${index}`, id, athlete, index % 2 === 0 ? "WOMAN" : "MAN"],
      );
    }
    for (const [index, event] of events.entries()) {
      await db.query(
        `INSERT INTO "Event" (id, "competitionId", name, position, "scoreType", "higherIsBetter",
                              "timeCapSeconds", "repsPerRound")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `${id}-e${index}`,
          id,
          event.name,
          index,
          event.scoreType,
          event.higherIsBetter,
          event.timeCapSeconds ?? null,
          event.repsPerRound ?? null,
        ],
      );
    }
  });
  const competition = `/competitions/${id}`;
  return { competition, events: events.map((_, index) => `${competition}/events/${id}-e${index}`) };
}

/** Picks the scoring rules on the Scoring rules step, and waits for them to save. */
async function rules(page: Page, competition: string, ...choices: string[]) {
  await page.goto(`${competition}/setup?step=2`);
  await expect(page.getByRole("heading", { name: "Scoring rules" })).toBeVisible();
  for (const choice of choices) await page.getByText(choice, { exact: true }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
  // The scoring rules save in the background: wait until the server has them.
  await expect(page.getByRole("status").filter({ hasText: "Saving…" })).toBeHidden();
  await page.waitForLoadState("networkidle");
}

/** One athlete's row on the score page. */
function row(page: Page, athlete: string) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("radio", { name: "Capped" }) })
    .filter({ hasText: athlete });
}

/** Types a result into an athlete's row, box by box, and leaves it to save. */
async function result(page: Page, athlete: string, boxes: Record<string, string>, shows = "finished") {
  const line = row(page, athlete);
  const labels = Object.keys(boxes);
  for (const label of labels) await line.getByLabel(label, { exact: true }).fill(boxes[label]);
  await line.getByLabel(labels.at(-1)!, { exact: true }).blur();
  await expect(line.getByText(shows, { exact: true })).toBeVisible();
}

async function time(page: Page, athlete: string, minutesSeconds: string, tiebreak?: string) {
  const [minutes, seconds] = minutesSeconds.split(":");
  if (tiebreak) await row(page, athlete).getByLabel("Tiebreak time").fill(tiebreak);
  await result(page, athlete, { Minutes: minutes, Seconds: seconds });
}

/** The leaderboard as name → [place, points per event..., total]. */
async function leaderboard(page: Page, competition: string, names: string[]) {
  await page.goto(`${competition}/leaderboard`);
  const table: Record<string, string[]> = {};
  for (const name of names) {
    const cells = page.getByRole("row", { name: new RegExp(`\\b${name}\\b`) }).getByRole("cell");
    await expect(cells.first()).toBeVisible();
    const texts = (await cells.allInnerTexts()).map((text) => text.trim());
    // Place, then everything after the name.
    table[name] = [texts[0], ...texts.slice(2)];
  }
  return table;
}

test.describe("scoring rules", () => {
  test("placing points: lowest total wins, and a no-show comes in behind everyone", async ({ page }) => {
    const names = ["Anna", "Erik", "Maja"];
    const { competition, events } = await individual("Scoring Placing", names, [
      { name: "Sprint", scoreType: "TIME", higherIsBetter: false },
      { name: "Chipper", scoreType: "TIME", higherIsBetter: false },
    ]);
    await rules(page, competition, "Placing points");

    await page.goto(events[0]);
    await time(page, "Anna", "5:00");
    await time(page, "Erik", "6:00");
    await row(page, "Maja").getByText("No-show", { exact: true }).click();
    await expect(row(page, "Maja").getByText("no-show · 0 points")).toBeVisible();
    await expect(page.getByText("3 / 3 entered")).toBeVisible();

    await page.goto(events[1]);
    await time(page, "Erik", "6:30");
    await time(page, "Maja", "7:00");
    await time(page, "Anna", "8:00");

    // 1st is 1 point, and a no-show is one behind last of three: 4.
    const board = await leaderboard(page, competition, names);
    expect(board.Erik).toEqual(["1", "2", "1", "3"]);
    expect(board.Anna).toEqual(["2", "1", "3", "4"]);
    expect(board.Maja).toEqual(["3", "4", "2", "6"]);
    await expect(page.getByText(/Lowest total wins/)).toBeVisible();
  });

  test("a tie shares the higher place, is split by tiebreak time, or shares the average", async ({ page }) => {
    const names = ["Anna", "Erik", "Maja"];
    const { competition, events } = await individual("Scoring Ties", names, [
      { name: "Fran", scoreType: "TIME", higherIsBetter: false },
    ]);
    await page.goto(events[0]);
    // Anna and Erik finish together; Anna was faster at the tiebreak.
    await time(page, "Anna", "5:00", "4:10");
    await time(page, "Erik", "5:00", "4:20");
    await time(page, "Maja", "6:00");

    // The default: both take 1st, so Maja is 3rd of three, steps of 33.
    let board = await leaderboard(page, competition, names);
    expect(board.Anna.slice(1)).toEqual(["100", "100"]);
    expect(board.Erik.slice(1)).toEqual(["100", "100"]);
    expect(board.Maja.slice(1)).toEqual(["34", "34"]);

    await rules(page, competition, "Split by tiebreak time");
    board = await leaderboard(page, competition, names);
    expect(board.Anna.slice(1)).toEqual(["100", "100"]);
    expect(board.Erik.slice(1)).toEqual(["67", "67"]);
    expect(board.Maja.slice(1)).toEqual(["34", "34"]);

    await rules(page, competition, "Share the average");
    board = await leaderboard(page, competition, names);
    expect(board.Anna.slice(1)).toEqual(["83.5", "83.5"]);
    expect(board.Erik.slice(1)).toEqual(["83.5", "83.5"]);
    expect(board.Maja.slice(1)).toEqual(["34", "34"]);
  });

  test("each kind of score is typed in its own way and ranked the right way round", async ({ page }) => {
    const names = ["Anna", "Erik"];
    const { competition, events } = await individual("Scoring Kinds", names, [
      { name: "Max reps", scoreType: "REPS", higherIsBetter: true },
      { name: "Cindy", scoreType: "ROUNDS_REPS", higherIsBetter: true, repsPerRound: 10 },
      { name: "Clean", scoreType: "WEIGHT", higherIsBetter: true },
      { name: "Capped", scoreType: "TIME_OR_REPS", higherIsBetter: false, timeCapSeconds: 600 },
    ]);

    // More reps wins.
    await page.goto(events[0]);
    await result(page, "Anna", { Reps: "120" });
    await result(page, "Erik", { Reps: "135" });

    // Rounds and reps: five rounds and three beats five rounds and one.
    await page.goto(events[1]);
    await result(page, "Anna", { Rounds: "5", Reps: "3" });
    await result(page, "Erik", { Rounds: "5", Reps: "1" });
    await expect(row(page, "Anna")).toContainText("5+3");

    // The heaviest lift wins, half kilos and all.
    await page.goto(events[2]);
    await result(page, "Anna", { Kilograms: "82.5" });
    await result(page, "Erik", { Kilograms: "80" });
    await expect(row(page, "Anna")).toContainText("82.5");

    // Finishing under the cap beats any number of reps at the cap.
    await page.goto(events[3]);
    await time(page, "Anna", "9:30");
    await row(page, "Erik").getByText("Capped", { exact: true }).click();
    await result(page, "Erik", { "Reps completed": "150" }, "capped at 10:00");
    await expect(page.getByText("2 / 2 entered")).toBeVisible();

    const board = await leaderboard(page, competition, names);
    expect(board.Anna).toEqual(["1", "50", "100", "100", "100", "350"]);
    expect(board.Erik).toEqual(["2", "100", "50", "50", "50", "250"]);

    // The same standings come out in the spreadsheet download.
    await page.goto(`${competition}/results?format=csv`);
    const downloading = page.waitForEvent("download");
    await page.locator('a[href*="/results/export"]').click();
    const file = await (await downloading).path();
    const csv = (await import("node:fs")).readFileSync(file, "utf8");
    expect(csv).toMatch(/Anna.*350/);
    expect(csv).toMatch(/Erik.*250/);
  });
});

test.describe("heats", () => {
  /** The athletes in one heat, read off its floor plan. */
  async function heat(page: Page, number: number, names: string[]) {
    await page.getByRole("navigation", { name: "Heats" }).getByRole("link", { name: new RegExp(`^Heat ${number}\\b`) }).click();
    await expect(page).toHaveURL(new RegExp(`heat=${number}$`));
    const plan = await page.getByRole("main").innerText();
    // The heat list and the page heading hold no athlete names, so whoever
    // is named on the page is in this heat.
    return names.filter((name) => new RegExp(`\\b${name}\\b`).test(plan));
  }

  async function workOut(page: Page, lanes: string, order: string) {
    await page.getByLabel("Lanes on the floor").fill(lanes);
    await page.getByLabel("Running order").selectOption({ label: order });
    await page.getByRole("button", { name: /^(Work out the heats|Work them out again)$/ }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "Work them out again" })).toBeVisible();
  }

  test("heats run by standing either way round, or at random without the last heat going first", async ({
    page,
  }) => {
    const names = ["Anna", "Erik", "Maja", "Lars", "Sara", "Olof"];
    const { events } = await individual(
      "Scoring Heats",
      names,
      ["Sprint", "Row", "Run"].map((name) => ({ name, scoreType: "TIME" as const, higherIsBetter: false })),
    );
    // Results in the first event, Anna fastest and Olof slowest.
    await page.goto(events[0]);
    for (const [index, name] of names.entries()) await time(page, name, `${5 + index}:00`);

    await page.goto(`${events[1]}/heats`);
    await workOut(page, "2", "By standing — leaders last");
    await expect(page.getByRole("navigation", { name: "Heats" }).getByRole("link")).toHaveCount(3);
    expect(await heat(page, 3, names)).toEqual(["Anna", "Erik"]);
    expect(await heat(page, 1, names)).toEqual(["Sara", "Olof"]);

    await workOut(page, "3", "By standing — leaders first");
    await expect(page.getByRole("navigation", { name: "Heats" }).getByRole("link")).toHaveCount(2);
    expect(await heat(page, 1, names)).toEqual(["Anna", "Erik", "Maja"]);
    // Both are remembered for the next event.
    await page.goto(`${events[2]}/heats`);
    await expect(page.getByLabel("Lanes on the floor")).toHaveValue("3");
    await expect(page.getByLabel("Running order")).toHaveValue("REVERSED");

    // At random, whoever ran last in the event before never starts the next.
    await page.goto(`${events[1]}/heats`);
    const lastBefore = await heat(page, 2, names);
    await page.goto(`${events[2]}/heats`);
    for (let tries = 0; tries < 4; tries++) {
      await workOut(page, "3", "Random — last heat never starts next");
      const first = await heat(page, 1, names);
      expect(first).toHaveLength(3);
      expect(first.filter((name) => lastBefore.includes(name))).toEqual([]);
    }
  });
});
