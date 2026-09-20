import test from "node:test";
import assert from "node:assert/strict";
import { parseScore, formatScore } from "./score-format.ts";

const time = { scoreType: "TIME" } as const;
const reps = { scoreType: "REPS" } as const;
const weight = { scoreType: "WEIGHT" } as const;
const roundsReps = { scoreType: "ROUNDS_REPS", repsPerRound: 20 } as const;

test("a time is read as seconds", () => {
  assert.deepEqual(parseScore("7:16", time), { ok: true, value: 436 });
  assert.deepEqual(parseScore("1:02:30", time), { ok: true, value: 3750 });
});

test("a time comes back out in the same shape", () => {
  assert.equal(formatScore(436, time), "7:16");
  assert.equal(formatScore(3750, time), "1:02:30");
  assert.equal(formatScore(65, time), "1:05");
});

test("nonsense times are refused with a readable message", () => {
  const result = parseScore("seven sixteen", time);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /mm:ss/);
});

test("seconds over 59 are refused, because 1:75 is ambiguous", () => {
  assert.equal(parseScore("1:75", time).ok, false);
});

test("rounds and reps become a single total", () => {
  // 5 full rounds of 20, plus 12 = 112
  assert.deepEqual(parseScore("5+12", roundsReps), { ok: true, value: 112 });
  assert.equal(formatScore(112, roundsReps), "5+12");
});

test("leftover reps that make a whole round are refused", () => {
  const result = parseScore("5+20", roundsReps);
  assert.equal(result.ok, false);
});

test("rounds and reps need the round length to be set", () => {
  const result = parseScore("5+12", { scoreType: "ROUNDS_REPS", repsPerRound: null });
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /reps per round/);
});

test("weight is stored in grams so there are no decimals to go wrong", () => {
  assert.deepEqual(parseScore("102.5", weight), { ok: true, value: 102500 });
  assert.deepEqual(parseScore("102,5", weight), { ok: true, value: 102500 });
  assert.equal(formatScore(102500, weight), "102.5 kg");
  assert.equal(formatScore(100000, weight), "100 kg");
});

test("plain reps are read as they are", () => {
  assert.deepEqual(parseScore("154", reps), { ok: true, value: 154 });
  assert.equal(parseScore("15.5", reps).ok, false);
});

test("an empty box asks for a score rather than crashing", () => {
  const result = parseScore("   ", reps);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /Enter a score/);
});
