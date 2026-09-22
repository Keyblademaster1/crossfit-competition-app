import test from "node:test";
import assert from "node:assert/strict";
import { byName } from "./order.ts";

test("teams read the way they are counted, not the way text sorts", () => {
  const teams = ["Team 10", "Team 2", "Team 1", "Team 11", "Team 9"].map((name) => ({ name }));
  assert.deepEqual(
    [...teams].sort(byName).map((t) => t.name),
    ["Team 1", "Team 2", "Team 9", "Team 10", "Team 11"],
  );
});

test("names without numbers still sort as words", () => {
  const teams = ["Barbell Belles", "Anvil", "Crush"].map((name) => ({ name }));
  assert.deepEqual(
    [...teams].sort(byName).map((t) => t.name),
    ["Anvil", "Barbell Belles", "Crush"],
  );
});
