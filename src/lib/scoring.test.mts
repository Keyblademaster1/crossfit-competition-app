import test from "node:test";
import assert from "node:assert/strict";
import { rankEvent, buildStandings } from "./scoring.ts";

test("lowest time wins when lower is better", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 436 },
      { unitId: "erik", value: 401 },
      { unitId: "maja", value: 502 },
    ],
    false,
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
  );
  assert.equal(ranks[0].unitId, "erik");
});

test("tied results share a rank and both earn the full points", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 100 },
      { unitId: "erik", value: 100 },
      { unitId: "maja", value: 90 },
    ],
    true,
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

test("a tiebreak time separates otherwise equal results", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 100, tiebreakSeconds: 180 },
      { unitId: "erik", value: 100, tiebreakSeconds: 165 },
    ],
    true,
  );
  assert.equal(ranks[0].unitId, "erik", "the faster tiebreak time places higher");
  assert.equal(ranks[0].rank, 1);
  assert.equal(ranks[1].rank, 2, "they are no longer tied");
});

test("someone who did not finish ranks below everyone who did", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 200, didNotFinish: true },
      { unitId: "erik", value: 10 },
    ],
    true,
  );
  assert.equal(ranks[0].unitId, "erik", "finishing beats a bigger unfinished score");
});

test("among non-finishers, more work done ranks higher", () => {
  const ranks = rankEvent(
    [
      { unitId: "anna", value: 80, didNotFinish: true },
      { unitId: "erik", value: 95, didNotFinish: true },
    ],
    false,
  );
  assert.equal(ranks[0].unitId, "erik");
});

test("lowest total points wins overall", () => {
  const standings = buildStandings([
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
  ]);

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

test("an overall tie breaks on the best single event finish", () => {
  const standings = buildStandings([
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
        { unitId: "anna", value: 90 },
        { unitId: "erik", value: 100 },
      ],
    },
  ]);

  // Both finish on 3 points, and both have a 1st and a 2nd, so they stay level.
  assert.equal(standings[0].totalPoints, 3);
  assert.equal(standings[1].totalPoints, 3);
  assert.equal(standings[0].position, 1);
  assert.equal(standings[1].position, 1, "genuinely level units share a position");
});

test("a better single event finish wins a points tie", () => {
  const standings = buildStandings([
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
  ]);

  // anna 1+4=5, maja 3+1=4, erik 2+3=5, lars 4+2=6
  // anna and erik both have 5. anna's best finish is 1st, erik's is 2nd.
  const anna = standings.find((s) => s.unitId === "anna")!;
  const erik = standings.find((s) => s.unitId === "erik")!;
  assert.ok(anna.position < erik.position, "anna's 1st place beats erik's 2nd");
});

test("missing scores simply do not earn points", () => {
  const standings = buildStandings([
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
  ]);

  const erik = standings.find((s) => s.unitId === "erik")!;
  assert.equal(erik.totalPoints, 2);
  assert.equal(erik.pointsByEvent["e2"], undefined);
});
