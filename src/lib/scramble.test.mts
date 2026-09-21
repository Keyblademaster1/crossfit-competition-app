import test from "node:test";
import assert from "node:assert/strict";
import { drawTeams, pairKey, type Drawable } from "./scramble.ts";

const pool = (count: number): Drawable[] =>
  Array.from({ length: count }, (_, i) => ({
    athleteId: `a${i + 1}`,
    position: i + 1,
  }));

const teamsOf = (result: { teams: { athleteIds: string[] }[] }) =>
  result.teams.map((t) => t.athleteIds);

test("snake puts the best and the worst on the same team", () => {
  // 6 athletes, teams of 3 -> 2 teams.
  // Dealt: 1->t1, 2->t2, then backwards 3->t2, 4->t1, then 5->t1, 6->t2
  const result = drawTeams(pool(6), { method: "SNAKE", teamSize: 3 });
  assert.deepEqual(teamsOf(result), [
    ["a1", "a4", "a5"],
    ["a2", "a3", "a6"],
  ]);
});

test("snake keeps team strength close together", () => {
  const result = drawTeams(pool(12), { method: "SNAKE", teamSize: 4 });
  const strength = result.teams.map((team) =>
    team.athleteIds.reduce((sum, id) => sum + Number(id.slice(1)), 0),
  );
  const spread = Math.max(...strength) - Math.min(...strength);
  assert.ok(spread <= 2, `teams should be near-even, got spread of ${spread}`);
});

test("halves pairs someone from the top half with someone from the bottom", () => {
  // 8 athletes: top half is 1-4, bottom half is 5-8.
  const result = drawTeams(pool(8), { method: "HALVES", teamSize: 2 });
  for (const team of result.teams) {
    const ranks = team.athleteIds.map((id) => Number(id.slice(1)));
    assert.ok(
      ranks.some((r) => r <= 4) && ranks.some((r) => r > 4),
      `team ${ranks} should span both halves`,
    );
  }
});

test("everybody gets placed exactly once", () => {
  for (const method of ["SNAKE", "RANDOM", "HALVES"] as const) {
    const result = drawTeams(pool(11), { method, teamSize: 3 });
    const placed = result.teams.flatMap((t) => t.athleteIds);
    assert.equal(placed.length, 11, `${method} placed the wrong number`);
    assert.equal(new Set(placed).size, 11, `${method} placed someone twice`);
  }
});

test("an uneven pool leaves the last team short rather than dropping anyone", () => {
  const result = drawTeams(pool(7), { method: "RANDOM", teamSize: 3 });
  assert.equal(result.teams.length, 3);
  assert.deepEqual(
    result.teams.map((t) => t.athleteIds.length).sort(),
    [1, 3, 3],
  );
});

test("a fixed generator gives a repeatable random draw", () => {
  const fixed = () => 0.42;
  const first = drawTeams(pool(8), { method: "RANDOM", teamSize: 2, random: fixed });
  const second = drawTeams(pool(8), { method: "RANDOM", teamSize: 2, random: fixed });
  assert.deepEqual(teamsOf(first), teamsOf(second));
});

test("an empty pool draws no teams", () => {
  assert.deepEqual(drawTeams([], { method: "SNAKE", teamSize: 3 }).teams, []);
});

test("a team size below one is rejected", () => {
  assert.throws(() => drawTeams(pool(4), { method: "SNAKE", teamSize: 0 }));
});

// --- Never the same partner twice --------------------------------------

test("athletes who have been teammates are split up", () => {
  // Snake alone would pair a1 with a4, and a2 with a3.
  const previous = new Set([pairKey("a1", "a4"), pairKey("a2", "a3")]);
  const result = drawTeams(pool(4), {
    method: "SNAKE",
    teamSize: 2,
    teammateRule: "ALWAYS_DIFFERENT",
    previousPairs: previous,
  });

  for (const team of result.teams) {
    const [a, b] = team.athleteIds;
    assert.ok(!previous.has(pairKey(a, b)), `${a} and ${b} have already been teammates`);
  }
  assert.ok(result.swaps > 0, "it should have had to swap somebody");
  assert.deepEqual(result.warnings, []);
});

test("repeats are allowed to stand when the rule says so", () => {
  const previous = new Set([pairKey("a1", "a4")]);
  const result = drawTeams(pool(4), {
    method: "SNAKE",
    teamSize: 2,
    teammateRule: "ALLOW_REPEATS",
    previousPairs: previous,
  });
  assert.equal(result.swaps, 0, "nothing should be rearranged");
});

test("an impossible repeat rule is reported rather than hidden", () => {
  // Only one possible pairing is left, and it has already happened.
  const previous = new Set([pairKey("a1", "a2")]);
  const result = drawTeams(pool(2), {
    method: "SNAKE",
    teamSize: 2,
    teammateRule: "ALWAYS_DIFFERENT",
    previousPairs: previous,
  });
  assert.equal(result.teams.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /teammates before/);
});

// --- Gender ------------------------------------------------------------

test("mixed pairs put a woman with a man", () => {
  const athletes: Drawable[] = [
    { athleteId: "w1", position: 1, gender: "WOMAN" },
    { athleteId: "w2", position: 2, gender: "WOMAN" },
    { athleteId: "m1", position: 3, gender: "MAN" },
    { athleteId: "m2", position: 4, gender: "MAN" },
  ];
  const result = drawTeams(athletes, {
    method: "SNAKE",
    teamSize: 2,
    drawGender: "MIXED",
  });

  const genderOf = new Map(athletes.map((a) => [a.athleteId, a.gender]));
  for (const team of result.teams) {
    const genders = team.athleteIds.map((id) => genderOf.get(id));
    assert.equal(new Set(genders).size, 2, `team ${team.athleteIds} is not mixed`);
  }
  assert.deepEqual(result.warnings, []);
});

test("same-gender pairs keep women with women", () => {
  const athletes: Drawable[] = [
    { athleteId: "w1", position: 1, gender: "WOMAN" },
    { athleteId: "m1", position: 2, gender: "MAN" },
    { athleteId: "w2", position: 3, gender: "WOMAN" },
    { athleteId: "m2", position: 4, gender: "MAN" },
  ];
  const result = drawTeams(athletes, {
    method: "SNAKE",
    teamSize: 2,
    drawGender: "SAME",
  });

  const genderOf = new Map(athletes.map((a) => [a.athleteId, a.gender]));
  for (const team of result.teams) {
    const genders = team.athleteIds.map((id) => genderOf.get(id));
    assert.equal(new Set(genders).size, 1, `team ${team.athleteIds} is not same gender`);
  }
});

test("uneven genders are reported rather than silently ignored", () => {
  const athletes: Drawable[] = [
    { athleteId: "w1", position: 1, gender: "WOMAN" },
    { athleteId: "w2", position: 2, gender: "WOMAN" },
    { athleteId: "w3", position: 3, gender: "WOMAN" },
    { athleteId: "m1", position: 4, gender: "MAN" },
  ];
  const result = drawTeams(athletes, {
    method: "SNAKE",
    teamSize: 2,
    drawGender: "MIXED",
  });
  // Only one man, so only one team can possibly be mixed.
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /not mixed/);
});

// --- 60+ ----------------------------------------------------------------

test("60+ athletes are spread across the teams", () => {
  const athletes: Drawable[] = [
    { athleteId: "o1", position: 1, isSixtyPlus: true },
    { athleteId: "o2", position: 2, isSixtyPlus: true },
    { athleteId: "y1", position: 3 },
    { athleteId: "y2", position: 4 },
  ];
  const result = drawTeams(athletes, {
    method: "SNAKE",
    teamSize: 2,
    spreadSixtyPlus: true,
  });

  const sixty = new Set(["o1", "o2"]);
  for (const team of result.teams) {
    const count = team.athleteIds.filter((id) => sixty.has(id)).length;
    assert.equal(count, 1, `team ${team.athleteIds} should have exactly one 60+ athlete`);
  }
});

test("60+ athletes are left alone when the switch is off", () => {
  const athletes: Drawable[] = [
    { athleteId: "o1", position: 1, isSixtyPlus: true },
    { athleteId: "o2", position: 4, isSixtyPlus: true },
    { athleteId: "y1", position: 2 },
    { athleteId: "y2", position: 3 },
  ];
  const result = drawTeams(athletes, {
    method: "SNAKE",
    teamSize: 2,
    spreadSixtyPlus: false,
  });
  assert.equal(result.swaps, 0);
});

test("the rules are applied together", () => {
  const athletes: Drawable[] = [
    { athleteId: "w1", position: 1, gender: "WOMAN", isSixtyPlus: true },
    { athleteId: "m1", position: 2, gender: "MAN" },
    { athleteId: "w2", position: 3, gender: "WOMAN" },
    { athleteId: "m2", position: 4, gender: "MAN", isSixtyPlus: true },
  ];
  const result = drawTeams(athletes, {
    method: "SNAKE",
    teamSize: 2,
    drawGender: "MIXED",
    spreadSixtyPlus: true,
    teammateRule: "ALWAYS_DIFFERENT",
    previousPairs: new Set([pairKey("w1", "m2")]),
  });

  const byId = new Map(athletes.map((a) => [a.athleteId, a]));
  for (const team of result.teams) {
    const members = team.athleteIds.map((id) => byId.get(id)!);
    assert.equal(new Set(members.map((m) => m.gender)).size, 2, "each team is mixed");
    assert.equal(members.filter((m) => m.isSixtyPlus).length, 1, "60+ spread evenly");
  }
  assert.deepEqual(result.warnings, []);
});
