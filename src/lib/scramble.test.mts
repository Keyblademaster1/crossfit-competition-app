import test from "node:test";
import assert from "node:assert/strict";
import { drawTeams, type Drawable } from "./scramble.ts";

const pool = (count: number): Drawable[] =>
  Array.from({ length: count }, (_, i) => ({
    athleteId: `a${i + 1}`,
    position: i + 1,
  }));

test("snake puts the best and the worst on the same team", () => {
  // 6 athletes, teams of 3 -> 2 teams.
  // Dealt: 1->t1, 2->t2, then backwards 3->t2, 4->t1, then 5->t1, 6->t2
  const teams = drawTeams(pool(6), { method: "SNAKE", teamSize: 3 });

  assert.equal(teams.length, 2);
  assert.deepEqual(teams[0].athleteIds, ["a1", "a4", "a5"]);
  assert.deepEqual(teams[1].athleteIds, ["a2", "a3", "a6"]);
});

test("snake keeps team strength close together", () => {
  const teams = drawTeams(pool(12), { method: "SNAKE", teamSize: 4 });
  const strength = teams.map((team) =>
    team.athleteIds.reduce((sum, id) => sum + Number(id.slice(1)), 0),
  );
  const spread = Math.max(...strength) - Math.min(...strength);
  assert.ok(spread <= 2, `teams should be near-even, got spread of ${spread}`);
});

test("everybody gets placed exactly once", () => {
  for (const method of ["SNAKE", "RANDOM"] as const) {
    const teams = drawTeams(pool(11), { method, teamSize: 3 });
    const placed = teams.flatMap((t) => t.athleteIds);
    assert.equal(placed.length, 11, `${method} placed the wrong number`);
    assert.equal(new Set(placed).size, 11, `${method} placed someone twice`);
  }
});

test("an uneven pool leaves the last team short rather than dropping anyone", () => {
  const teams = drawTeams(pool(7), { method: "RANDOM", teamSize: 3 });
  assert.equal(teams.length, 3);
  assert.deepEqual(
    teams.map((t) => t.athleteIds.length),
    [3, 3, 1],
  );
});

test("a fixed generator gives a repeatable random draw", () => {
  const fixed = () => 0.42;
  const first = drawTeams(pool(8), { method: "RANDOM", teamSize: 2, random: fixed });
  const second = drawTeams(pool(8), { method: "RANDOM", teamSize: 2, random: fixed });
  assert.deepEqual(first, second);
});

test("an empty pool draws no teams", () => {
  assert.deepEqual(drawTeams([], { method: "SNAKE", teamSize: 3 }), []);
});

test("a team size below one is rejected", () => {
  assert.throws(() => drawTeams(pool(4), { method: "SNAKE", teamSize: 0 }));
});
