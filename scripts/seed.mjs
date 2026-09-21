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
import { userInfo } from "node:os";

const url =
  process.env.DATABASE_URL ??
  process.env.LOCAL_DATABASE_URL ??
  `postgresql://${userInfo().username}@localhost:5432/holger_comp`;

const COMPETITION = "seed-competition";

const ATHLETES = [
  ["Jonas Lind", "MAN", false],
  ["Anna Svensson", "WOMAN", false],
  ["Sara Holm", "WOMAN", false],
  ["Maja Ek", "WOMAN", false],
  ["Klara Persson", "WOMAN", false],
  ["Erik Berg", "MAN", false],
  ["Filip Åberg", "MAN", false],
  ["Johan Nilsson", "MAN", true],
  ["Oskar Nyström", "MAN", false],
  ["Viktor Sandberg", "MAN", false],
  ["Elin Dahl", "WOMAN", true],
  ["Linnea Ström", "WOMAN", false],
];

/**
 * Each event: how it is scored, and the pairs with the result the pair posted.
 * Pairs change between events, which is the whole point of a scramble.
 */
const EVENTS = [
  {
    name: "Event 1 — The Chipper",
    scoreType: "TIME",
    higherIsBetter: false,
    timeCapSeconds: 12 * 60,
    repsPerRound: null,
    // [athlete index, athlete index, seconds, status]
    results: [
      [0, 11, 436, "FINISHED"],
      [1, 10, 461, "FINISHED"],
      [2, 9, 478, "FINISHED"],
      [3, 8, 511, "FINISHED"],
      [4, 7, 186, "CAPPED"],
      [5, 6, 552, "FINISHED"],
    ],
  },
  {
    name: "Event 2 — AMRAP 12",
    scoreType: "ROUNDS_REPS",
    higherIsBetter: true,
    timeCapSeconds: null,
    repsPerRound: 45,
    // Stored as total reps: rounds * 45 + leftover.
    results: [
      [0, 4, 6 * 45 + 20, "FINISHED"],
      [1, 6, 6 * 45 + 8, "FINISHED"],
      [3, 7, 5 * 45 + 40, "FINISHED"],
      [2, 10, 5 * 45 + 22, "FINISHED"],
      [5, 9, 5 * 45 + 12, "FINISHED"],
      [8, 11, 4 * 45 + 38, "FINISHED"],
    ],
  },
  {
    name: "Event 3 — Clean Ladder",
    scoreType: "WEIGHT",
    higherIsBetter: true,
    timeCapSeconds: null,
    repsPerRound: null,
    // Stored in grams: the pair's combined lift.
    results: [
      [0, 10, 162_500, "FINISHED"],
      [2, 8, 167_500, "FINISHED"],
      [1, 6, 135_000, "FINISHED"],
      [3, 9, 155_000, "FINISHED"],
      [4, 5, 140_000, "FINISHED"],
      [7, 11, 0, "NO_SHOW"],
    ],
  },
  {
    name: "Event 4 — Partner Finale",
    scoreType: "TIME",
    higherIsBetter: false,
    timeCapSeconds: 8 * 60,
    repsPerRound: null,
    results: [], // Still to come, so the board reads "after event 3 of 4".
  },
];

const client = new Client({ connectionString: url });
await client.connect();

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
        "timeCapSeconds", "repsPerRound")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
    [
      eventId,
      COMPETITION,
      event.name,
      index + 1,
      event.scoreType,
      event.higherIsBetter,
      event.timeCapSeconds,
      event.repsPerRound,
    ],
  );

  for (const [pairIndex, [a, b, value, status]] of event.results.entries()) {
    const teamId = `seed-team-${index}-${pairIndex}`;
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
      // The pair posts one result; each of them is credited with it, because
      // in a scramble the points belong to the athlete, not the team.
      await client.query(
        `INSERT INTO "Score" (id, "eventId", "athleteId", value, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, now(), now());`,
        [`seed-score-${index}-${athlete}`, eventId, athleteIds[athlete], value, status],
      );
    }
  }
}

console.log("Added a competition: Holger Scramble 2026");
console.log(`  ${ATHLETES.length} athletes, ${EVENTS.length} events, 3 of them scored.`);
await client.end();
