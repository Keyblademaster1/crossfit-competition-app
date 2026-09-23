import test from "node:test";
import assert from "node:assert/strict";
import { teamClass, classLabel } from "./team-class.ts";

test("two men are M/M and two women are W/W", () => {
  assert.equal(classLabel(teamClass(["MAN", "MAN"])), "M/M");
  assert.equal(classLabel(teamClass(["WOMAN", "WOMAN"])), "W/W");
});

test("one woman and one man are mixed", () => {
  assert.equal(classLabel(teamClass(["WOMAN", "MAN"])), "Mixed");
});

test("a bigger team with both is mixed too", () => {
  assert.equal(teamClass(["MAN", "MAN", "MAN", "WOMAN"]), "MIXED");
});

test("anyone without their sex set leaves the class unknown, not guessed", () => {
  assert.equal(teamClass(["WOMAN", null]), null);
  assert.equal(classLabel(teamClass(["WOMAN", null])), "Class not known");
});

test("a team with nobody on it has no class yet", () => {
  assert.equal(teamClass([]), null);
});
