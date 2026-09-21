import test from "node:test";
import assert from "node:assert/strict";
import { nextStep, readScoreInput, clearsScore } from "./form-input.ts";

const form = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};

// --- Moving through the setup wizard ------------------------------------
//
// These cover a bug that made Continue do nothing on two of the six steps.

test("Continue goes to the step it asks for", () => {
  assert.equal(nextStep(form({ goto: "4" }), 3), 4);
});

test("the steps in the left-hand list can jump backwards", () => {
  assert.equal(nextStep(form({ goto: "0" }), 4), 0);
});

test("a button that asks for nothing stays where it is", () => {
  // "Add athlete" must not move the organiser off the athletes step.
  assert.equal(nextStep(form({}), 3), 3);
  assert.equal(nextStep(form({ goto: "" }), 3), 3);
});

test("a step number outside the wizard is pulled back inside it", () => {
  assert.equal(nextStep(form({ goto: "99" }), 3), 5);
  assert.equal(nextStep(form({ goto: "-2" }), 3), 0);
});

test("nonsense stays put rather than throwing", () => {
  assert.equal(nextStep(form({ goto: "banana" }), 2), 2);
});

// --- Reading a result ----------------------------------------------------

test("minutes and seconds are joined back into a time", () => {
  const result = readScoreInput(form({ minutes: "7", seconds: "16" }), "TIME");
  assert.deepEqual(result, { raw: "7:16", status: "FINISHED" });
});

test("a single-digit seconds box is padded", () => {
  const result = readScoreInput(form({ minutes: "7", seconds: "6" }), "TIME");
  assert.equal(result.raw, "7:06");
});

test("half a time is treated as nothing given", () => {
  // Autosave fires while the scorekeeper is still typing. Recording 5 minutes
  // and no seconds as a finished time would be wrong.
  assert.equal(readScoreInput(form({ minutes: "5", seconds: "" }), "TIME").raw, "");
  assert.equal(readScoreInput(form({ minutes: "", seconds: "30" }), "TIME").raw, "");
});

test("rounds and reps are joined back together", () => {
  assert.equal(readScoreInput(form({ rounds: "5", reps: "12" }), "ROUNDS_REPS").raw, "5+12");
});

test("rounds with no leftover reps still reads", () => {
  assert.equal(readScoreInput(form({ rounds: "5", reps: "" }), "ROUNDS_REPS").raw, "5+0");
});

test("a capped result is read as the reps completed", () => {
  const result = readScoreInput(
    form({ status: "CAPPED", reps: "186", minutes: "9", seconds: "00" }),
    "TIME",
  );
  // The time boxes are ignored: a capped result is scored on how far they got.
  assert.deepEqual(result, { raw: "186", status: "CAPPED" });
});

test("a no-show needs no number", () => {
  const result = readScoreInput(form({ status: "NO_SHOW" }), "TIME");
  assert.deepEqual(result, { raw: "0", status: "NO_SHOW" });
});

test("weights and plain reps come through as typed", () => {
  assert.equal(readScoreInput(form({ value: "102.5" }), "WEIGHT").raw, "102.5");
  assert.equal(readScoreInput(form({ value: "154" }), "REPS").raw, "154");
});

test("an unknown status is treated as finished", () => {
  assert.equal(readScoreInput(form({ status: "WAT", value: "10" }), "REPS").status, "FINISHED");
});

// --- Clearing a result ---------------------------------------------------

test("emptying the boxes on a finished result removes it", () => {
  assert.equal(clearsScore({ raw: "", status: "FINISHED" }), true);
});

test("an empty capped result is not yet filled in, so nothing is removed", () => {
  // This is the bug that made choosing "Capped" wipe the result underneath.
  assert.equal(clearsScore({ raw: "", status: "CAPPED" }), false);
});

test("a no-show never clears anything", () => {
  assert.equal(clearsScore({ raw: "0", status: "NO_SHOW" }), false);
});

test("a result that has a value never clears anything", () => {
  assert.equal(clearsScore({ raw: "7:16", status: "FINISHED" }), false);
});
