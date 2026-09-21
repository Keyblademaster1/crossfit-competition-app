import test from "node:test";
import assert from "node:assert/strict";
import {
  rankEvent,
  buildStandings,
  pointsForPlace,
  type ScoringRules,
} from "./scoring.ts";

const placing: ScoringRules = { pointsSystem: "PLACING", eventTieRule: "SHARE_HIGHER" };
const hundred: ScoringRules = { pointsSystem: "HUNDRED_STEPS", eventTieRule: "SHARE_HIGHER" };

test("lowest time wins when lower is better", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 436 },
      { unitId: "erik", value: 401 },
      { unitId: "maja", value: 502 },
    ],
    false,
    placing,
  );
  assert.deepEqual(ranks, [
    { unitId: "erik", rank: 1, points: 1 },
    { unitId: "anna", rank: 2, points: 2 },
    { unitId: "maja", rank: 3, points: 3 },
  ]);
});

test("most reps wins when higher is better", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 120 },
      { unitId: "erik", value: 155 },
    ],
    true,
    placing,
  );
  assert.equal(ranks[0].unitId, "erik");
});

test("tied results share a place and both earn the full points", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 100 },
      { unitId: "erik", value: 100 },
      { unitId: "maja", value: 90 },
    ],
    true,
    placing,
  );
  // Joint first, then third. Second is used up by the tie.
  assert.deepEqual(
    ranks.map((r) => [r.unitId, r.rank]),
    [
      ["anna", 1],
      ["erik", 1],
      ["maja", 3],
    ],
  );
  assert.equal(ranks[1].points, 1, "a joint winner earns the winner's points");
});

// --- The hundred-step points system -------------------------------------

test("the winner always gets 100, whatever the step is", () => {
  assert.equal(pointsForPlace(1, 12, "HUNDRED_STEPS"), 100);
  assert.equal(pointsForPlace(1, 3, "HUNDRED_STEPS"), 100);
});

test("with 12 entries the places drop by 8 at a time", () => {
  // 100 divided by 12 is 8 when rounded down.
  assert.equal(pointsForPlace(2, 12, "HUNDRED_STEPS"), 92);
  assert.equal(pointsForPlace(3, 12, "HUNDRED_STEPS"), 84);
  assert.equal(pointsForPlace(12, 12, "HUNDRED_STEPS"), 12);
});

test("points never go below zero", () => {
  assert.equal(pointsForPlace(40, 3, "HUNDRED_STEPS"), 0);
});

test("the hundred-step system awards points by place", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 100 },
      { unitId: "erik", value: 90 },
      { unitId: "maja", value: 80 },
      { unitId: "lars", value: 70 },
    ],
    true,
    hundred,
  );
  // 4 entries, so the step is 25.
  assert.deepEqual(
    ranks.map((r) => r.points),
    [100, 75, 50, 25],
  );
});

// --- Statuses ------------------------------------------------------------

test("a capped result ranks below everyone who finished", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 200, status: "CAPPED" },
      { unitId: "erik", value: 10 },
    ],
    true,
    placing,
  );
  assert.equal(ranks[0].unitId, "erik", "finishing beats a bigger capped score");
});

test("among capped results, more work done ranks higher", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 80, status: "CAPPED" },
      { unitId: "erik", value: 95, status: "CAPPED" },
    ],
    false,
    placing,
  );
  assert.equal(ranks[0].unitId, "erik");
});

test("a no-show ranks below even a capped result", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 0, status: "NO_SHOW" },
      { unitId: "erik", value: 5, status: "CAPPED" },
      { unitId: "maja", value: 300 },
    ],
    true,
    placing,
  );
  assert.deepEqual(
    ranks.map((r) => r.unitId),
    ["maja", "erik", "anna"],
  );
});

test("a no-show scores nothing under the hundred-step system", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 100 },
      { unitId: "erik", value: 0, status: "NO_SHOW" },
    ],
    true,
    hundred,
  );
  assert.equal(ranks[1].points, 0);
});

test("a no-show gets last place plus one under placing points", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 100 },
      { unitId: "erik", value: 90 },
      { unitId: "maja", value: 0, status: "NO_SHOW" },
    ],
    true,
    placing,
  );
  // Three entries, so a no-show gets 4 rather than 3.
  assert.equal(ranks[2].points, 4);
});

// --- Tie rules -----------------------------------------------------------

test("share the higher place ignores the tiebreak time", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 100, tiebreakSeconds: 180 },
      { unitId: "erik", value: 100, tiebreakSeconds: 165 },
    ],
    true,
    { pointsSystem: "PLACING", eventTieRule: "SHARE_HIGHER" },
  );
  assert.equal(ranks[0].rank, 1);
  assert.equal(ranks[1].rank, 1, "both stay joint first");
});

test("the tiebreak rule separates otherwise equal results", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 100, tiebreakSeconds: 180 },
      { unitId: "erik", value: 100, tiebreakSeconds: 165 },
    ],
    true,
    { pointsSystem: "PLACING", eventTieRule: "TIEBREAK_TIME" },
  );
  assert.equal(ranks[0].unitId, "erik", "the faster tiebreak time places higher");
  assert.equal(ranks[1].rank, 2, "they are no longer tied");
});

test("the tiebreak rule still shares the place when neither has a time", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 100 },
      { unitId: "erik", value: 100 },
    ],
    true,
    { pointsSystem: "PLACING", eventTieRule: "TIEBREAK_TIME" },
  );
  assert.equal(ranks[0].rank, 1);
  assert.equal(ranks[1].rank, 1);
});

test("sharing the average splits the places between them", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 100 },
      { unitId: "erik", value: 90 },
      { unitId: "maja", value: 90 },
      { unitId: "lars", value: 80 },
    ],
    true,
    { pointsSystem: "HUNDRED_STEPS", eventTieRule: "SHARE_AVERAGE" },
  );
  // 4 entries, step 25: places are worth 100, 75, 50, 25.
  // Erik and Maja tie for 2nd, so they share the mean of 75 and 50.
  const erik = ranks.find((r) => r.unitId === "erik")!;
  const maja = ranks.find((r) => r.unitId === "maja")!;
  assert.equal(erik.points, 62.5);
  assert.equal(maja.points, 62.5);
  assert.equal(erik.rank, 2, "they still show as joint second");
  assert.equal(ranks.find((r) => r.unitId === "lars")!.points, 25);
});

// --- Overall standings ---------------------------------------------------

test("lowest total wins under placing points", () => {
  const standings = buildStandings(
    [
      {
        eventId: "e1",
        higherIsBetter: false,
        scores: [
          { unitId: "anna", value: 400 },
          { unitId: "erik", value: 410 },
          { unitId: "maja", value: 420 },
        ],
      },
      {
        eventId: "e2",
        higherIsBetter: true,
        scores: [
          { unitId: "anna", value: 100 },
          { unitId: "erik", value: 150 },
          { unitId: "maja", value: 120 },
        ],
      },
    ],
    placing,
  );

  // anna 1+3=4, erik 2+1=3, maja 3+2=5
  assert.deepEqual(
    standings.map((s) => [s.unitId, s.totalPoints, s.position]),
    [
      ["erik", 3, 1],
      ["anna", 4, 2],
      ["maja", 5, 3],
    ],
  );
});

test("highest total wins under the hundred-step system", () => {
  const standings = buildStandings(
    [
      {
        eventId: "e1",
        higherIsBetter: true,
        scores: [
          { unitId: "anna", value: 100 },
          { unitId: "erik", value: 90 },
        ],
      },
      {
        eventId: "e2",
        higherIsBetter: true,
        scores: [
          { unitId: "anna", value: 10 },
          { unitId: "erik", value: 90 },
        ],
      },
    ],
    hundred,
  );

  // 2 entries, step 50: a win is 100, second is 50. Both end on 150.
  assert.equal(standings[0].totalPoints, 150);
  assert.equal(standings[1].totalPoints, 150);
  assert.equal(standings[0].position, 1);
  assert.equal(standings[1].position, 1, "genuinely level units share a position");
});

test("a better single event placing wins a points tie", () => {
  const standings = buildStandings(
    [
      {
        eventId: "e1",
        higherIsBetter: true,
        scores: [
          { unitId: "anna", value: 100 },
          { unitId: "erik", value: 90 },
          { unitId: "maja", value: 80 },
          { unitId: "lars", value: 70 },
        ],
      },
      {
        eventId: "e2",
        higherIsBetter: true,
        scores: [
          { unitId: "anna", value: 70 },
          { unitId: "erik", value: 80 },
          { unitId: "maja", value: 100 },
          { unitId: "lars", value: 90 },
        ],
      },
    ],
    placing,
  );

  // anna 1+4=5, erik 2+3=5. anna's best placing is 1st, erik's is 2nd.
  const anna = standings.find((s) => s.unitId === "anna")!;
  const erik = standings.find((s) => s.unitId === "erik")!;
  assert.ok(anna.position < erik.position, "anna's 1st place beats erik's 2nd");
});

test("missing scores simply do not earn points", () => {
  const standings = buildStandings(
    [
      {
        eventId: "e1",
        higherIsBetter: true,
        scores: [
          { unitId: "anna", value: 100 },
          { unitId: "erik", value: 90 },
        ],
      },
      {
        eventId: "e2",
        higherIsBetter: true,
        scores: [{ unitId: "anna", value: 50 }],
      },
    ],
    placing,
  );

  const erik = standings.find((s) => s.unitId === "erik")!;
  assert.equal(erik.totalPoints, 2);
  assert.equal(erik.pointsByEvent["e2"], undefined);
});

test("an event with nobody in it ranks nobody", () => {
  assert.deepEqual(rankEvent([], true, placing), []);
});
