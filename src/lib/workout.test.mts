import test from "node:test";
import assert from "node:assert/strict";
import {
  totalRepsReached,
  whereTheyReached,
  describeReached,
  repsInBlock,
  totalReps,
  repSequence,
  scoringFor,
  blockSummary,
  type BlockPlan,
} from "./workout.ts";

// The Chipper: 30 row, 50 wall balls, 40 toes-to-bar, 30 box jumps, 50 burpees.
const CHIPPER = [
  { id: "row", name: "Calorie row", reps: 30 },
  { id: "wall", name: "Wall balls", reps: 50 },
  { id: "ttb", name: "Toes-to-bar", reps: 40 },
  { id: "box", name: "Box jumps", reps: 30 },
  { id: "burpee", name: "Burpees", reps: 50 },
];

test("everything before the movement they reached counts", () => {
  // 30 + 50 + 40 + 30 = 150 finished, plus 36 burpees.
  assert.equal(totalRepsReached(CHIPPER, "burpee", 36), 186);
});

test("reaching the first movement counts only what they did", () => {
  assert.equal(totalRepsReached(CHIPPER, "row", 12), 12);
});

test("getting nowhere in a movement still counts what came before", () => {
  assert.equal(totalRepsReached(CHIPPER, "ttb", 0), 80);
});

test("more reps than the movement holds is capped at the movement", () => {
  // Saying "60 into the wall balls" when there are only 50 means they
  // finished them; it cannot silently spill into the next movement.
  assert.equal(totalRepsReached(CHIPPER, "wall", 60), 80);
});

test("a workout with no movements written down still takes a plain total", () => {
  assert.equal(totalRepsReached([], "nothing", 186), 186);
});

test("a total is turned back into where they reached", () => {
  assert.deepEqual(whereTheyReached(CHIPPER, 186), { movementId: "burpee", repsInto: 36 });
  assert.deepEqual(whereTheyReached(CHIPPER, 12), { movementId: "row", repsInto: 12 });
  assert.deepEqual(whereTheyReached(CHIPPER, 80), { movementId: "ttb", repsInto: 0 });
});

test("a total that finished the workout shows at the end", () => {
  assert.deepEqual(whereTheyReached(CHIPPER, 200), { movementId: "burpee", repsInto: 50 });
});

test("reading a total and writing it back gives the same number", () => {
  for (const total of [0, 1, 29, 30, 31, 80, 150, 186, 199]) {
    const reached = whereTheyReached(CHIPPER, total)!;
    assert.equal(
      totalRepsReached(CHIPPER, reached.movementId, reached.repsInto),
      total,
      `round trip failed at ${total}`,
    );
  }
});

test("a capped result reads the way a judge would say it", () => {
  assert.equal(describeReached(CHIPPER, 186), "36 into Burpees");
  assert.equal(describeReached([], 186), "186 reps");
});

// --- Blocks ---------------------------------------------------------------

const move = (id: string, reps: number, name = id) => ({ id, name, reps });
const block = (
  format: BlockPlan["format"],
  movements: BlockPlan["movements"],
  setting: string | null = null,
): BlockPlan => ({ id: format, format, setting, movements });

test("rounds for time counts every round", () => {
  assert.equal(repsInBlock(block("ROUNDS_FOR_TIME", [move("a", 10), move("b", 5)], "5")), 75);
});

test("a ladder's reps come from its scheme, not the rep field", () => {
  const thrustersAndPullUps = [move("t", 1), move("p", 1)];
  assert.equal(repsInBlock(block("LADDER", thrustersAndPullUps, "21-15-9")), 90);
});

test("an AMRAP counts one round, and max load and rest count nothing", () => {
  assert.equal(repsInBlock(block("AMRAP", [move("a", 10), move("b", 15)], "12")), 25);
  assert.equal(repsInBlock(block("MAX_LOAD", [move("c", 1)], "6:00")), 0);
  assert.equal(repsInBlock(block("REST", [], "2:00")), 0);
});

test("the Partner finale adds up to 140 reps", () => {
  // 100 double-unders, then AMRAP 5 of 10 + 10, then 20 sandbag over shoulder.
  const finale = [
    block("FOR_TIME", [move("du", 100)]),
    block("AMRAP", [move("th", 10), move("bob", 10)], "5"),
    block("FOR_TIME", [move("sb", 20)]),
  ];
  assert.equal(totalReps(finale), 140);
});

test("a capped result counts the finished rounds", () => {
  const rounds = [block("ROUNDS_FOR_TIME", [move("pu", 10, "Pull-ups"), move("sq", 20, "Squats")], "3")];
  const lines = repSequence(rounds);
  assert.equal(lines.length, 6);
  assert.equal(lines[2].name, "Pull-ups, round 2");
  // Two full rounds, then 5 pull-ups into the third: 30 + 30 + 5.
  assert.equal(totalRepsReached(lines, "pu#3", 5), 65);
  assert.equal(describeReached(lines, 65), "5 into Pull-ups, round 3");
});

test("a ladder is entered step by step", () => {
  const lines = repSequence([block("LADDER", [move("t", 0, "Thrusters")], "21-15-9")]);
  assert.deepEqual(lines.map((l) => l.name), ["21 Thrusters", "15 Thrusters", "9 Thrusters"]);
});

test("a movement done once keeps its own id, so old results still line up", () => {
  const lines = repSequence([block("FOR_TIME", [move("row", 30), move("wb", 50)])]);
  assert.deepEqual(lines.map((l) => l.id), ["row", "wb"]);
});

test("most events are time if finished, reps if capped", () => {
  const scoring = scoringFor([block("FOR_TIME", [move("a", 30)])]);
  assert.equal(scoring.scoreType, "TIME_OR_REPS");
  assert.equal(scoring.higherIsBetter, false);
});

test("an event of only max-load work ranks on the heaviest lift", () => {
  assert.equal(scoringFor([block("MAX_LOAD", [move("c", 1)], "6:00")]).scoreType, "WEIGHT");
});

test("a lone AMRAP is rounds + reps, with the round size from its movements", () => {
  const scoring = scoringFor([block("AMRAP", [move("a", 10), move("b", 15), move("c", 20)], "12")]);
  assert.equal(scoring.scoreType, "ROUNDS_REPS");
  assert.equal(scoring.repsPerRound, 45);
});

test("a rest block does not change how an event is scored", () => {
  const scoring = scoringFor([
    block("MAX_LOAD", [move("c", 1)], "6:00"),
    block("REST", [], "2:00"),
  ]);
  assert.equal(scoring.scoreType, "WEIGHT");
});

test("the summary under a block says what it adds up to", () => {
  const amrap = { ...block("AMRAP", [move("a", 10), move("b", 15)], "12"), split: "YOU_GO_I_GO" as const };
  assert.equal(blockSummary(amrap, true), "25 reps per round · 12 minutes · one round each, alternating");
  assert.equal(blockSummary(amrap, false), "25 reps per round · 12 minutes");
});
