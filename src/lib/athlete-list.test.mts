import test from "node:test";
import assert from "node:assert/strict";
import {
  editedRows,
  parseAthleteList,
  parseAthleteRows,
  parseCsv,
  withoutDuplicates,
} from "./athlete-list.ts";

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
  assert.deepEqual(list[0], {
    name: "Eva Lastname",
    gender: "WOMAN",
    isSixtyPlus: true,
    division: null,
    team: null,
  });
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

test("a Team column puts people on teams; without one, nobody gets a team", () => {
  const list = parseAthleteRows(
    [
      ["Name", "Sex", "60+", "Team", "Division"],
      ["Anna", "W", "", "Iron Sisters", "rx"],
      ["Jonas", "M", "60+", "Deadlift  Dads", "Scaled"],
    ],
    ["RX", "Scaled"],
  );
  assert.deepEqual(list[0], {
    name: "Anna",
    gender: "WOMAN",
    isSixtyPlus: false,
    division: "RX",
    team: "Iron Sisters",
  });
  assert.equal(list[1].team, "Deadlift Dads");
  assert.equal(list[1].isSixtyPlus, true);

  // A team name looks like any other word, so only the column says so.
  const [pasted] = parseAthleteList("Anna, W, Iron Sisters");
  assert.equal(pasted.team, null);
});

test("columns in any order, in Swedish, with first and last name apart", () => {
  const [athlete] = parseAthleteRows([
    ["Lag", "Efternamn", "Förnamn", "Kön", "Ålder"],
    ["Iron Sisters", "Lastname", "Anna", "Kvinna", "63"],
  ]);
  assert.equal(athlete.name, "Anna Lastname");
  assert.equal(athlete.team, "Iron Sisters");
  assert.equal(athlete.gender, "WOMAN");
  // An age of 60 or more counts as 60+.
  assert.equal(athlete.isSixtyPlus, true);
});

test("a 60+ column may hold a tick or a younger age", () => {
  const list = parseAthleteRows([["Name", "60+"], ["Anna", "x"], ["Sara", "45"], ["Eva", "ja"]]);
  assert.deepEqual(
    list.map((a) => a.isSixtyPlus),
    [true, false, true],
  );
});

test("empty rows in a spreadsheet are skipped", () => {
  const list = parseAthleteRows([["Name"], ["", ""], ["Anna"], ["  "]]);
  assert.deepEqual(
    list.map((a) => a.name),
    ["Anna"],
  );
});

test("CSV with commas, or with semicolons as Swedish Excel saves it", () => {
  assert.deepEqual(parseCsv("Name,Sex\r\nAnna,W\r\n"), [
    ["Name", "Sex"],
    ["Anna", "W"],
  ]);
  assert.deepEqual(parseCsv("\uFEFFNamn;Kön;Lag\nAnna;K;Chalk, Sweat & Tears\n"), [
    ["Namn", "Kön", "Lag"],
    ["Anna", "K", "Chalk, Sweat & Tears"],
  ]);
});

test("CSV cells in quotes may hold the separator, a quote mark or a line break", () => {
  assert.deepEqual(parseCsv('Team,Name\n"Chalk, Sweat & Tears","Anna ""The Rock"""\n"Two\nLines",Sara'), [
    ["Team", "Name"],
    ["Chalk, Sweat & Tears", 'Anna "The Rock"'],
    ["Two\nLines", "Sara"],
  ]);
});

test("60+ in the Division column, as a box competition would put it", () => {
  const list = parseAthleteRows([["Name", "Sex", "Division"], ["Anna", "W", "60+"], ["Sara", "W", ""]]);
  assert.deepEqual(
    list.map((a) => [a.isSixtyPlus, a.division]),
    [
      [true, null],
      [false, null],
    ],
  );
});

test("a birth date or year counts as 60+ from the year someone turns 60", () => {
  const list = parseAthleteRows(
    [
      ["Namn", "Födelsedatum"],
      ["Anna", "1966-12-31"],
      ["Sara", "12/03/1967"],
      ["Eva", "1950"],
      ["Elin", "19661101"],
      ["Maja", ""],
    ],
    [],
    2026,
  );
  assert.deepEqual(
    list.map((a) => a.isSixtyPlus),
    [true, false, true, true, false],
  );
});

test("a list edited on the page is checked before it is trusted", () => {
  const json = JSON.stringify([
    { name: "  Lina   Lastname ", gender: "WOMAN", isSixtyPlus: true, division: "RX", team: "Iron Sisters" },
    { name: "Erik", gender: "BOTH", isSixtyPlus: "yes", division: "Elite", team: 7 },
    { name: "", gender: "MAN" },
    "not a row",
    null,
  ]);
  assert.deepEqual(editedRows(json, ["RX", "Scaled"]), [
    { name: "Lina Lastname", gender: "WOMAN", isSixtyPlus: true, division: "RX", team: "Iron Sisters" },
    { name: "Erik", gender: null, isSixtyPlus: false, division: null, team: null },
  ]);
  assert.deepEqual(editedRows("{not json"), []);
  assert.deepEqual(editedRows('{"name":"Anna"}'), []);
});
