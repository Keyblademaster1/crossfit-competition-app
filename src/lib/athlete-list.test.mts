import test from "node:test";
import assert from "node:assert/strict";
import { parseAthleteList, withoutDuplicates } from "./athlete-list.ts";

test("one name per line, blank lines ignored", () => {
  const list = parseAthleteList("Anna Lastname\n\n  Jonas Lastname  \n");
  assert.deepEqual(
    list.map((a) => a.name),
    ["Anna Lastname", "Jonas Lastname"],
  );
  assert.equal(list[0].gender, null);
  assert.equal(list[0].isSixtyPlus, false);
});

test("gender and 60+ after a comma, in either order", () => {
  const [anna, jonas] = parseAthleteList("Anna Lastname, W, 60+\nJonas Lastname, 60+, M");
  assert.equal(anna.gender, "WOMAN");
  assert.equal(anna.isSixtyPlus, true);
  assert.equal(jonas.gender, "MAN");
  assert.equal(jonas.isSixtyPlus, true);
});

test("rows copied from a spreadsheet, header row and all", () => {
  const list = parseAthleteList("Namn\tKön\tÅlder\r\nEva Lastname\tKvinna\t60+\r\nPer Lastname\tHerr\t\r\n");
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { name: "Eva Lastname", gender: "WOMAN", isSixtyPlus: true, division: null });
  assert.equal(list[1].gender, "MAN");
});

test("a column it does not recognise is ignored", () => {
  const [athlete] = parseAthleteList("Sara Lastname, sara@example.com, W");
  assert.equal(athlete.name, "Sara Lastname");
  assert.equal(athlete.gender, "WOMAN");
});

test("divisions are matched by name, ignoring capitals", () => {
  const [athlete] = parseAthleteList("Sara Lastname; rx", ["RX", "Scaled"]);
  assert.equal(athlete.division, "RX");
});

test("pasting the same list twice adds nobody the second time", () => {
  const pasted = parseAthleteList("Anna Lastname\nJonas Lastname\njonas  lastname");
  const { toAdd, skipped } = withoutDuplicates(pasted, ["ANNA LASTNAME"]);
  assert.deepEqual(
    toAdd.map((a) => a.name),
    ["Jonas Lastname"],
  );
  assert.equal(skipped, 2);
});
