import { test, expect, type Page } from "@playwright/test";
import { withDatabase } from "./database";
import { slowWhenAsked } from "./slow";

test.beforeEach(async ({ page }, info) => slowWhenAsked(page, info));

/**
 * Scramble competitions, round after round.
 *
 * In a scramble the teams are drawn again before every event, and the points
 * belong to each athlete. So these run several events in a row, and check
 * every choice the Format step and the draw screen offer: the draw method,
 * the teammate rule, the sex in the draw, spreading out the 60+ athletes and
 * the team size.
 *
 * Each competition is set up through the wizard, as an organiser would. Only
 * the events are put straight into the database: building them is the event
 * builder's own tests, and here only their number matters.
 */

const STAMP = Date.now();

const made: string[] = [];
test.afterEach(async () => {
  if (made.length === 0) return;
  const ids = made.splice(0);
  await withDatabase((db) => db.query(`DELETE FROM "Competition" WHERE id = ANY($1)`, [ids]));
});

interface Choices {
  method: "Random" | "Best + worst" | "Top + bottom half";
  teammates?: "Always different" | "Avoid repeats" | "Repeats allowed";
  sex?: "Ignore" | "Mixed pairs" | "Same sex";
  spreadSixtyPlus?: boolean;
  teamSize?: number;
}

/**
 * Sets up a scramble through the wizard, with the athletes pasted in and
 * `rounds` timed events, and returns where it lives and its events' ids.
 */
async function scramble(page: Page, name: string, choices: Choices, athletes: string, rounds: number) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start a new competition" }).click();
  await expect(page.getByRole("heading", { name: "The basics" })).toBeVisible();
  const setup = page.url().split("?")[0];
  const competition = setup.replace(/\/setup$/, "");
  const id = competition.split("/").pop()!;
  made.push(id);

  await page.getByLabel("Competition name").fill(`${name} ${STAMP}`);
  await page.getByLabel("Date").fill("2026-11-14");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Format & teams" })).toBeVisible();
  await settled(page);

  await page.getByText("Scramble", { exact: true }).click();
  for (let size = 2; size < (choices.teamSize ?? 2); size++) {
    await page.getByRole("button", { name: "More per team" }).click();
    await expect(page.getByText(`Teams of ${size + 1}.`)).toBeVisible();
  }
  await page.getByText(choices.method, { exact: true }).click();
  if (choices.teammates) await page.getByText(choices.teammates, { exact: true }).click();
  if (choices.sex) await page.getByText(choices.sex, { exact: true }).click();
  if (choices.spreadSixtyPlus) await page.getByText("Spread 60+ athletes across teams").click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Scoring rules" })).toBeVisible();
  await settled(page);
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();

  await page.getByText("Paste a list", { exact: true }).click();
  await page.getByLabel("One athlete per line").fill(athletes);
  await page.getByRole("button", { name: "Add these" }).click();
  const count = athletes.trim().split("\n").length;
  await expect(page.getByText(`${count} athletes`, { exact: true })).toBeVisible();

  const events = Array.from({ length: rounds }, (_, index) => `${id}-round-${index + 1}`);
  await withDatabase(async (db) => {
    for (const [index, eventId] of events.entries()) {
      await db.query(
        `INSERT INTO "Event" (id, "competitionId", name, position, "scoreType", "higherIsBetter")
         VALUES ($1, $2, $3, $4, 'TIME', false)`,
        [eventId, id, `Round ${index + 1}`, index],
      );
    }
  });

  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Screens & sharing" })).toBeVisible();
  await page.getByRole("button", { name: /Finish setup/ }).click();
  await expect(page).toHaveURL(competition);
  return { setup, competition, events };
}

/** Waits for a format save to be through: the next step is covered until then. */
async function settled(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: "Saving…" })).toBeHidden();
}

/** The teams on the draw screen, as each team's athletes, from the names given. */
async function teamsOnScreen(page: Page, names: string[]): Promise<string[][]> {
  const cards = page.getByRole("region", { name: /^Team \d+$/ });
  await expect(cards.first()).toBeVisible();
  const teams: string[][] = [];
  for (const card of await cards.all()) {
    const lines = await card.getByRole("listitem").allInnerTexts();
    teams.push(lines.map((line) => names.find((name) => line.includes(name)) ?? line));
  }
  return teams;
}

/** Opens an event's draw screen and draws, or draws again, its teams. */
async function draw(page: Page, competition: string, eventId: string, names: string[]) {
  if (!page.url().endsWith(`/events/${eventId}/draw`)) {
    await page.goto(`${competition}/events/${eventId}/draw`);
  }
  // Each draw makes new teams, so the cards of the last one leave the page.
  const card = page.getByRole("region", { name: /^Team \d+$/ }).first();
  const before = (await card.count()) > 0 ? await card.elementHandle() : null;
  await page.getByRole("button", { name: /^(Draw teams|↻ Draw again)$/ }).click();
  if (before) await expect.poll(() => before.evaluate((node) => node.isConnected)).toBe(false);
  await expect(page.getByRole("button", { name: "↻ Draw again" })).toBeVisible();
  return teamsOnScreen(page, names);
}

/** Enters a finish time for each team on an event's score page, in team order. */
async function score(page: Page, competition: string, eventId: string, times: string[]) {
  await page.goto(`${competition}/events/${eventId}`);
  const rows = page.locator("form").filter({ has: page.getByRole("radio", { name: "Capped" }) });
  for (const [index, time] of times.entries()) {
    const [minutes, seconds] = time.split(":");
    const row = rows.filter({ hasText: new RegExp(`Team ${index + 1}(?!\\d)`) });
    await row.getByLabel("Minutes").fill(minutes);
    await row.getByLabel("Seconds").fill(seconds);
    await row.getByLabel("Seconds").blur();
    await expect(row.getByText("finished", { exact: true })).toBeVisible();
  }
  await expect(page.getByText(`${times.length} / ${times.length} entered`)).toBeVisible();
}

const pair = (team: string[]) => [...team].sort().join(" & ");

async function totalOf(page: Page, athlete: string) {
  const row = page.getByRole("row", { name: new RegExp(`\\b${athlete}\\b`) });
  return Number(await row.getByRole("cell").last().innerText());
}

test.describe("scramble competitions", () => {
  test("three rounds: a new teammate every round, and each athlete keeps their own points", async ({ page }) => {
    const names = ["Anna", "Erik", "Maja", "Lars"];
    const { competition, events } = await scramble(
      page,
      "Scramble Three Rounds",
      { method: "Random", teammates: "Always different" },
      "Anna, W\nErik, M\nMaja, W\nLars, M",
      3,
    );

    const seen = new Set<string>();
    const won = new Map(names.map((name) => [name, 0]));
    for (const eventId of events) {
      const teams = await draw(page, competition, eventId, names);
      expect(teams).toHaveLength(2);
      for (const team of teams) {
        expect(team).toHaveLength(2);
        // Four athletes have exactly three ways to pair up: one per round.
        expect(seen.has(pair(team))).toBe(false);
        seen.add(pair(team));
      }
      await expect(page.getByText("Everyone has a new teammate.")).toBeVisible();
      await expect(page.getByText("Teamed before")).toHaveCount(0);

      // Team 1 wins every round.
      await score(page, competition, eventId, ["7:00", "8:00"]);
      for (const name of teams[0]) won.set(name, won.get(name)! + 1);
    }
    expect(seen.size).toBe(6);

    // Each athlete carries their own team's points from each round: a win
    // is 100, and second of two teams is third of four athletes, 50.
    await page.goto(`${competition}/leaderboard`);
    for (const name of names) {
      const wins = won.get(name)!;
      expect(await totalOf(page, name)).toBe(wins * 100 + (3 - wins) * 50);
    }
    await expect(page.getByRole("heading", { name: "No division" })).toHaveCount(0);
  });

  test("best + worst and top + bottom half pair the leaders with those behind", async ({ page }) => {
    const names = ["Anna", "Erik", "Maja", "Lars", "Sara", "Olof"];
    const { competition, events } = await scramble(
      page,
      "Scramble Standings",
      // Repeats allowed, so only the method decides who goes together.
      { method: "Best + worst", teammates: "Repeats allowed" },
      "Anna, W\nErik, M\nMaja, W\nLars, M\nSara, W\nOlof, M",
      2,
    );

    // Before anyone has a result there is nothing to rank on.
    const first = await draw(page, competition, events[0], names);
    expect(first).toHaveLength(3);
    await score(page, competition, events[0], ["7:00", "8:00", "9:00"]);
    const [top, middle, bottom] = first;

    // Best + worst: each winner goes with someone from the last team.
    let second = await draw(page, competition, events[1], names);
    await expect(page.getByRole("radio", { name: "Best + worst" })).toBeChecked();
    for (const name of top) {
      const team = second.find((t) => t.includes(name))!;
      expect(team.some((mate) => bottom.includes(mate))).toBe(true);
    }
    expect(second.map(pair)).toContain(pair(middle));
    // Where each athlete stands is shown beside their name.
    await expect(page.getByRole("listitem").filter({ hasText: top[0] })).toContainText("#1");

    // Top + bottom half, chosen on the draw screen: one from each half, so
    // the two winners are apart and so are the two last.
    await page.getByText("Top + bottom half", { exact: true }).click();
    second = await draw(page, competition, events[1], names);
    for (const team of second) {
      expect(team.filter((name) => top.includes(name)).length).toBeLessThanOrEqual(1);
      expect(team.filter((name) => bottom.includes(name)).length).toBeLessThanOrEqual(1);
    }
    // The choice made at the whiteboard sticks.
    await page.reload();
    await expect(page.getByRole("radio", { name: "Top + bottom half" })).toBeChecked();
  });

  test("mixed pairs put a woman with a man, and same sex keeps them apart", async ({ page }) => {
    const women = ["Anna", "Maja", "Sara", "Lina"];
    const men = ["Erik", "Lars", "Olof", "Nils"];
    const names = [...women, ...men];
    const { setup, competition, events } = await scramble(
      page,
      "Scramble Sexes",
      { method: "Random", sex: "Mixed pairs" },
      [...women.map((n) => `${n}, W`), ...men.map((n) => `${n}, M`)].join("\n"),
      1,
    );

    for (let tries = 0; tries < 3; tries++) {
      const teams = await draw(page, competition, events[0], names);
      expect(teams).toHaveLength(4);
      for (const team of teams) {
        expect(team.filter((name) => women.includes(name))).toHaveLength(1);
      }
    }

    // Changed afterwards on the Format step, and drawn again.
    await page.goto(`${setup}?step=1`);
    await page.getByText("Same sex", { exact: true }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Scoring rules" })).toBeVisible();
    await settled(page);
    for (let tries = 0; tries < 3; tries++) {
      const teams = await draw(page, competition, events[0], names);
      for (const team of teams) {
        const womenInTeam = team.filter((name) => women.includes(name)).length;
        expect([0, 2]).toContain(womenInTeam);
      }
    }
  });

  test("60+ athletes are spread across the teams", async ({ page }) => {
    const older = ["Anna", "Erik", "Maja"];
    const names = [...older, "Lars", "Sara", "Olof"];
    const { competition, events } = await scramble(
      page,
      "Scramble Sixty Plus",
      { method: "Random", spreadSixtyPlus: true },
      "Anna, W, 60+\nErik, M, 60+\nMaja, W, 60+\nLars, M\nSara, W\nOlof, M",
      1,
    );
    for (let tries = 0; tries < 3; tries++) {
      const teams = await draw(page, competition, events[0], names);
      expect(teams).toHaveLength(3);
      for (const team of teams) {
        expect(team.filter((name) => older.includes(name))).toHaveLength(1);
      }
    }
    await expect(page.getByRole("listitem").filter({ hasText: "Anna" })).toContainText("60+");
  });

  test("teams of three, with athletes left over, place everyone once", async ({ page }) => {
    const names = ["Anna", "Erik", "Maja", "Lars", "Sara", "Olof", "Lina"];
    const { competition, events } = await scramble(
      page,
      "Scramble Threes",
      { method: "Random", teamSize: 3 },
      "Anna, W\nErik, M\nMaja, W\nLars, M\nSara, W\nOlof, M\nLina, W",
      1,
    );
    const teams = await draw(page, competition, events[0], names);
    expect(teams.flat().sort()).toEqual([...names].sort());
    expect(Math.max(...teams.map((team) => team.length))).toBe(3);
    await expect(page.getByText("The athletes do not divide evenly into teams of 3.")).toBeVisible();

    // Every team is scored, short or not, and the points reach everyone.
    await score(page, competition, events[0], teams.map((_, index) => `${7 + index}:00`));
    await page.goto(`${competition}/leaderboard`);
    for (const name of names) expect(await totalOf(page, name)).toBeGreaterThan(0);
  });

  test("too few athletes to avoid a repeat says so", async ({ page }) => {
    const names = ["Anna", "Erik"];
    const { competition, events } = await scramble(
      page,
      "Scramble Repeats",
      { method: "Random", teammates: "Avoid repeats" },
      "Anna, W\nErik, M",
      2,
    );
    await draw(page, competition, events[0], names);
    await expect(page.getByText("Everyone has a new teammate.")).toBeVisible();
    await expect(page.getByText("New pair")).toBeVisible();
    await score(page, competition, events[0], ["7:00"]);

    await draw(page, competition, events[1], names);
    await expect(
      page.getByText("1 pair has been together before. There are not enough athletes to avoid it."),
    ).toBeVisible();
    await expect(page.getByText("Teamed before")).toBeVisible();
  });

  test("drawing again after scores are in starts that event's scores afresh", async ({ page }) => {
    const names = ["Anna", "Erik", "Maja", "Lars"];
    const { competition, events } = await scramble(
      page,
      "Scramble Redraw",
      { method: "Random", teammates: "Repeats allowed" },
      "Anna, W\nErik, M\nMaja, W\nLars, M",
      1,
    );
    await draw(page, competition, events[0], names);
    await score(page, competition, events[0], ["7:00", "8:00"]);

    await page.getByRole("link", { name: "Redraw teams" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Drawing again clears them" })).toBeVisible();
    await draw(page, competition, events[0], names);
    await page.goto(`${competition}/events/${events[0]}`);
    await expect(page.getByText("0 / 2 entered")).toBeVisible();
    await page.goto(`${competition}/leaderboard`);
    for (const name of names) expect(await totalOf(page, name)).toBe(0);
  });
});
