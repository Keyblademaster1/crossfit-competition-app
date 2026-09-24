#!/usr/bin/env node
/**
 * Fills a database with one realistic competition.
 *
 * An empty app shows nothing, which is no use for a demonstration or for
 * finding your way around. This puts in a scramble part way through: twelve
 * athletes, four events with three of them scored, and teams redrawn before
 * each one — so the leaderboard, the event ranking and the big screen all have
 * something real on them.
 *
 * Written in plain SQL rather than through Prisma, because Prisma's generated
 * code is built for a bundler and will not run straight from Node.
 */

import { Client } from "pg";
import { localUrl } from "./local-url.mjs";

// The laptop's own database, unless DATABASE_URL is set in the shell for this
// one run. Never the hosted one from .env.local: see local-url.mjs.
const url = process.env.DATABASE_URL ?? localUrl();

const COMPETITION = "seed-competition";

// First names only: this ends up in the README's screenshots, and the
// repository is public.
const ATHLETES = [
  ["Jonas", "MAN", false],
  ["Anna", "WOMAN", false],
  ["Sara", "WOMAN", false],
  ["Maja", "WOMAN", false],
  ["Klara", "WOMAN", false],
  ["Erik", "MAN", false],
  ["Filip", "MAN", false],
  ["Johan", "MAN", true],
  ["Oskar", "MAN", false],
  ["Viktor", "MAN", false],
  ["Elin", "WOMAN", true],
  ["Linnea", "WOMAN", false],
];

/**
 * Each event: how it is scored, and the pairs with the result the pair posted.
 * Pairs change between events, which is the whole point of a scramble.
 */
const EVENTS = [
  {
    name: "Event 1 — The Chipper",
    // How it is scored follows from the blocks (scoringFor in workout.ts).
    scoreType: "TIME_OR_REPS",
    higherIsBetter: false,
    timeCapSeconds: 12 * 60,
    repsPerRound: null,
    // [athlete index, athlete index, value, status]
    // Each block: format, setting, how the pair splits it, and its movements:
    // reps, name, [four loads], shared by the team?, what it is on.
    blocks: [
      ["FOR_TIME", null, "ANYHOW", [
        [30, "Calorie row", null, false, "ROWER"],
        [50, "Wall balls", ["9 kg", "6 kg", "6 kg", "4 kg"], false, "WALL_BALL"],
        [40, "Toes-to-bar", null, false, "PULL_UP_BAR"],
        [30, "Box jumps", ["60 cm", "50 cm", "50 cm", "40 cm"], false, "BOX"],
        [50, "Burpees", null, false, "OTHER"],
      ]],
    ],
    results: [
      [0, 11, 436, "FINISHED"],
      [1, 9, 461, "FINISHED"],
      [2, 8, 478, "FINISHED"],
      [3, 6, 511, "FINISHED"],
      [4, 7, 186, "CAPPED"],
      [10, 5, 552, "FINISHED"],
    ],
  },
  {
    name: "Event 2 — AMRAP 12",
    scoreType: "ROUNDS_REPS",
    higherIsBetter: true,
    timeCapSeconds: 12 * 60,
    repsPerRound: 45,
    blocks: [
      ["AMRAP", "12", "YOU_GO_I_GO", [
        [10, "Pull-ups", null, false, "PULL_UP_BAR"],
        [15, "Push-ups", null, false, "OTHER"],
        [20, "Air squats", null, false, "OTHER"],
      ]],
    ],
    // Stored as total reps: rounds * 45 + leftover.
    results: [
      [0, 4, 6 * 45 + 20, "FINISHED"],
      [1, 6, 6 * 45 + 8, "FINISHED"],
      [3, 7, 5 * 45 + 40, "FINISHED"],
      [2, 5, 5 * 45 + 22, "FINISHED"],
      [10, 9, 5 * 45 + 12, "FINISHED"],
      [11, 8, 4 * 45 + 38, "FINISHED"],
    ],
  },
  {
    name: "Event 3 — Clean Ladder",
    scoreType: "WEIGHT",
    higherIsBetter: true,
    timeCapSeconds: 6 * 60,
    repsPerRound: null,
    blocks: [["MAX_LOAD", "6:00", "BOTH_DO_ALL", [[1, "Clean, max load", null, false, "BARBELL"]]]],
    // Stored in grams: the pair's combined lift.
    results: [
      [1, 0, 162_500, "FINISHED"],
      [2, 9, 167_500, "FINISHED"],
      [3, 8, 155_000, "FINISHED"],
      [4, 6, 140_000, "FINISHED"],
      [10, 7, 135_000, "FINISHED"],
      [11, 5, 0, "NO_SHOW"],
    ],
  },
  {
    name: "Event 4 — Partner Finale",
    scoreType: "TIME_OR_REPS",
    higherIsBetter: false,
    timeCapSeconds: 8 * 60,
    repsPerRound: null,
    // Three blocks, as in the event-builder design.
    blocks: [
      ["FOR_TIME", null, "ANYHOW", [[100, "Double-unders", null, false, "JUMP_ROPE"]]],
      ["AMRAP", "5", "SYNCHRO", [
        [10, "Thrusters", ["42.5 kg", "30 kg", "30 kg", "20 kg"], false, "BARBELL"],
        [10, "Burpees over bar", null, false, "OTHER"],
      ]],
      ["FOR_TIME", null, "CONGA", [
        [20, "Sandbag over shoulder", ["70 kg", "50 kg", "60 kg", "40 kg"], true, "SANDBAG"],
      ]],
    ],
    // Drawn, but not run yet, so the board reads "after event 3 of 4" while
    // the heats still have somebody in them.
    results: [
      [3, 4, null, null],
      [6, 8, null, null],
      [2, 7, null, null],
      [0, 5, null, null],
      [1, 11, null, null],
      [9, 10, null, null],
    ],
  },
];

const client = new Client({ connectionString: url });
await client.connect();

// One transaction, so this either happens completely or not at all. Without
// it, two copies running at once can interleave — one deleting halfway
// through the other's inserts — and leave a competition missing an athlete.
await client.query("BEGIN");

// Start from nothing, so running this twice does not pile up duplicates.
await client.query(`DELETE FROM "Competition" WHERE id = $1;`, [COMPETITION]);

await client.query(
  `INSERT INTO "Competition"
     (id, name, mode, "teamSize", date, venue, "pointsSystem", "eventTieRule",
      "drawMethod", "teammateRule", "drawGender", "spreadSixtyPlus",
      "fixedTeamSource", "athleteAccess", "publicLink", "createdAt")
   VALUES ($1, 'Holger Scramble 2026', 'SCRAMBLE', 2, '2026-10-17', 'Holger, Skurup',
           'HUNDRED_STEPS', 'SHARE_HIGHER', 'SNAKE', 'ALWAYS_DIFFERENT', 'MIXED',
           true, 'SIGNUP', true, false, now());`,
  [COMPETITION],
);

const athleteIds = [];
for (const [index, [name, gender, sixtyPlus]] of ATHLETES.entries()) {
  const id = `seed-athlete-${index}`;
  athleteIds.push(id);
  await client.query(
    `INSERT INTO "Athlete" (id, "competitionId", name, gender, "isSixtyPlus")
     VALUES ($1, $2, $3, $4, $5);`,
    [id, COMPETITION, name, gender, sixtyPlus],
  );
}

for (const [index, event] of EVENTS.entries()) {
  const eventId = `seed-event-${index}`;
  await client.query(
    `INSERT INTO "Event"
       (id, "competitionId", name, position, "scoreType", "higherIsBetter",
        "timeCapSeconds", "repsPerRound", "tiebreakBlockId")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
    [
      eventId,
      COMPETITION,
      event.name,
      index + 1,
      event.scoreType,
      event.higherIsBetter,
      event.timeCapSeconds,
      event.repsPerRound,
      // The time at the end of the last block breaks a tie.
      `seed-block-${index}-${event.blocks.length - 1}`,
    ],
  );

  // Movements are numbered through the whole workout, block after block.
  let position = 0;
  for (const [blockOrder, [format, setting, split, movements]] of event.blocks.entries()) {
    const blockId = `seed-block-${index}-${blockOrder}`;
    await client.query(
      `INSERT INTO "Block" (id, "eventId", position, format, setting, split)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [blockId, eventId, blockOrder + 1, format, setting, split],
    );

    for (const [reps, name, loads, shared, implement] of movements) {
      position++;
      await client.query(
        `INSERT INTO "Movement"
           (id, "eventId", "blockId", position, reps, name, "loadMode", implement,
            "loadMenMen", "loadWomenWomen", "loadMixed", "loadSixtyPlus")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);`,
        [
          `seed-movement-${index}-${position}`,
          eventId,
          blockId,
          position,
          reps,
          name,
          shared ? "SHARED" : "EACH",
          implement ?? "OTHER",
          loads?.[0] ?? null,
          loads?.[1] ?? null,
          loads?.[2] ?? null,
          loads?.[3] ?? null,
        ],
      );
    }
  }

  // Three lanes to a heat, which is what the floor at Holger holds.
  const LANES = 3;
  const teamIds = [];

  for (const [pairIndex, [a, b, value, status]] of event.results.entries()) {
    const teamId = `seed-team-${index}-${pairIndex}`;
    teamIds.push(teamId);
    await client.query(
      `INSERT INTO "Team" (id, "competitionId", "eventId", name)
       VALUES ($1, $2, $3, $4);`,
      [teamId, COMPETITION, eventId, `Team ${pairIndex + 1}`],
    );

    for (const athlete of [a, b]) {
      await client.query(
        `INSERT INTO "TeamMember" ("teamId", "athleteId") VALUES ($1, $2);`,
        [teamId, athleteIds[athlete]],
      );
      // A pair with no result yet is drawn but has not been on the floor.
      if (value === null) continue;
      // The pair posts one result; each of them is credited with it, because
      // in a scramble the points belong to the athlete, not the team.
      await client.query(
        `INSERT INTO "Score" (id, "eventId", "athleteId", value, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, now(), now());`,
        [`seed-score-${index}-${athlete}`, eventId, athleteIds[athlete], value, status],
      );
    }
  }

  for (let start = 0; start < teamIds.length; start += LANES) {
    const heatId = `seed-heat-${index}-${start / LANES}`;
    await client.query(
      `INSERT INTO "Heat" (id, "eventId", number, "startsAt") VALUES ($1, $2, $3, $4);`,
      [heatId, eventId, start / LANES + 1, start === 0 ? "13:30" : "13:45"],
    );
    for (const [lane, teamId] of teamIds.slice(start, start + LANES).entries()) {
      await client.query(
        `INSERT INTO "Lane" (id, "heatId", number, "teamId") VALUES ($1, $2, $3, $4);`,
        [`${heatId}-lane-${lane}`, heatId, lane + 1, teamId],
      );
    }
  }
}

// Everything is in, so make it all real at once.
await client.query("COMMIT");

console.log("Added a competition: Holger Scramble 2026");
const movementCount = EVENTS.reduce(
  (n, e) => n + e.blocks.reduce((m, [, , , movements]) => m + movements.length, 0),
  0,
);
console.log(
  `  ${ATHLETES.length} athletes, ${EVENTS.length} events with ${movementCount} movements, 3 events scored.`,
);
await client.end();
