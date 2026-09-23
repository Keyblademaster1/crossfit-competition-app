import test from "node:test";
import assert from "node:assert/strict";
import { totalRepsReached, whereTheyReached, describeReached, repsInOneRound } from "./workout.ts";

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

// --- Reps in one round, for rounds + reps scores -------------------------

test("a round is every movement's reps added up", () => {
  assert.equal(repsInOneRound([{ reps: 5 }, { reps: 10 }, { reps: 15 }]), 30);
});

test("no movements means no round size yet", () => {
  assert.equal(repsInOneRound([]), null);
});

test("a division's own version of a movement is not counted twice", () => {
  const movements = [
    { reps: 10, divisionId: null },
    { reps: 10, divisionId: null },
    { reps: 8, divisionId: "scaled" },
  ];
  assert.equal(repsInOneRound(movements), 20);
});
