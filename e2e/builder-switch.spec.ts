import { test, expect } from "@playwright/test";
import { withDatabase } from "./database";
import { slowWhenAsked } from "./slow";

test.beforeEach(async ({ page }, info) => slowWhenAsked(page, info));

/**
 * Opening or adding an event takes a moment online, and in that moment the
 * old event used to sit on screen, ready to be typed into. Movements typed
 * then went into the wrong event or were lost. The builder now covers
 * itself until the new event is there (builder-switch.tsx).
 */
test("the builder cannot be typed in while another event is opening", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start a new competition" }).click();
  await expect(page.getByRole("heading", { name: "The basics" })).toBeVisible();
  const competition = page.url().split("/setup")[0];
  const id = competition.split("/").pop();
  await page.getByLabel("Competition name").fill("Slow Wifi Open");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText("Scramble", { exact: true }).click();
  await page.getByRole("button", { name: /Continue/ }).click();

  await page.goto(`${competition}/events`);
  await page.getByRole("button", { name: "+ Add event" }).click();
  const blockA = page.getByRole("region", { name: "Block A" });
  const newName = blockA.getByLabel("New movement in block A", { exact: true });
  await expect(newName).toBeEditable();

  // As slow as a bad connection: the next event takes two seconds to come.
  await page.route("**/events**", async (route) => {
    if (route.request().method() === "POST") await new Promise((done) => setTimeout(done, 2000));
    await route.continue();
  });
  await page.getByRole("button", { name: "+ Add event" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Adding a new event" })).toBeVisible();
  // Shut off, and with the cover in the way of every click.
  await expect(newName.locator("xpath=ancestor::*[@inert]")).toHaveCount(1);
  await expect(
    blockA.getByRole("button", { name: "+ Movement" }).click({ trial: true, timeout: 500 }),
  ).rejects.toThrow();

  // Once it is there, what is typed goes into the new event.
  await expect(page.getByRole("status").filter({ hasText: "Adding a new event" })).toBeHidden();
  await page.unroute("**/events**");
  await blockA.getByLabel("Reps of the new movement in block A").fill("12");
  await newName.fill("Burpees");
  await blockA.getByRole("button", { name: "+ Movement" }).click();
  await expect(blockA.locator('input[value="Burpees"]')).toBeVisible();

  const where = await withDatabase(async (db) =>
    (
      await db.query(
        `SELECT e.name FROM "Movement" m JOIN "Event" e ON e.id = m."eventId" WHERE e."competitionId" = $1`,
        [id],
      )
    ).rows.map((row) => row.name),
  );
  expect(where).toEqual(["Event 2"]);
});

/**
 * Adding a movement takes a moment online. The blank line used to keep what
 * was typed until then, so the next movement was typed on top of it, and a
 * line typed but never sent with "+ Movement" was lost. It now empties at
 * once, shows the movement as saving, and sends itself when it is left.
 */
test("movements typed in quick succession all land in their own event", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start a new competition" }).click();
  await expect(page.getByRole("heading", { name: "The basics" })).toBeVisible();
  const competition = page.url().split("/setup")[0];
  const id = competition.split("/").pop();
  await page.getByLabel("Competition name").fill("Quick Hands Open");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText("Scramble", { exact: true }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.goto(`${competition}/events`);

  const blockA = page.getByRole("region", { name: "Block A" });
  const newName = blockA.getByLabel("New movement in block A", { exact: true });
  for (const event of [1, 2]) {
    await page.getByRole("button", { name: "+ Add event" }).click();
    await expect(page.getByRole("textbox", { name: /Event \d name/ })).toHaveValue(`Event ${event}`);
    for (const movement of ["Burpees", "Thrusters"]) {
      await newName.click();
      await page.keyboard.type(`${movement} ${event}`);
      await blockA.getByRole("button", { name: "+ Movement" }).click();
      // Empty straight away, ready for the next one.
      await expect(newName).toHaveValue("");
    }
    // The last one is only typed, and then left.
    await newName.click();
    await page.keyboard.type(`Row ${event}`);
  }
  await page.getByRole("link", { name: /Event 1/ }).click();
  await expect(blockA.getByLabel("Movement", { exact: true })).toHaveCount(3);

  await expect
    .poll(() =>
      withDatabase(async (db) =>
        (
          await db.query(
            `SELECT e.name || ': ' || m.name AS line FROM "Movement" m JOIN "Event" e ON e.id = m."eventId"
             WHERE e."competitionId" = $1 ORDER BY e.name, m.position`,
            [id],
          )
        ).rows.map((row) => row.line),
      ),
    )
    .toEqual([
      "Event 1: Burpees 1",
      "Event 1: Thrusters 1",
      "Event 1: Row 1",
      "Event 2: Burpees 2",
      "Event 2: Thrusters 2",
      "Event 2: Row 2",
    ]);
});
