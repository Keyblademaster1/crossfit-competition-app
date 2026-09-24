import test from "node:test";
import assert from "node:assert/strict";
import {
  teamCategory,
  laneLoads,
  currentHeat,
  isSynchronised,
  stationCount,
  sharedLoad, heatsByGroup, keepLastHeatOutOfFirst } from "./heats.ts";

test("two men are an M/M team", () => {
  assert.equal(teamCategory(["MAN", "MAN"], false).label, "M/M");
});

test("two women are a W/W team", () => {
  assert.equal(teamCategory(["WOMAN", "WOMAN"], false).label, "W/W");
});

test("a man and a woman are a mixed team", () => {
  assert.equal(teamCategory(["MAN", "WOMAN"], false).label, "Mixed");
});

test("one 60+ athlete makes the whole team a 60+ team", () => {
  // Whichever pair they are: the 60+ load is what the lane gets set to.
  assert.equal(teamCategory(["MAN", "MAN"], true).field, "loadSixtyPlus");
});

const MAN = { name: "Oskar Lastname", gender: "MAN" };
const WOMAN = { name: "Anna Lastname", gender: "WOMAN" };

/** A barbell movement with whichever loads a test cares about. */
function barbell(loads: Partial<Record<string, string>>, name = "Thrusters") {
  return {
    name,
    loadMode: "EACH",
    implement: "BARBELL",
    loadMenMen: loads.menMen ?? null,
    loadWomenWomen: loads.womenWomen ?? null,
    loadMixed: loads.mixed ?? null,
    loadSixtyPlus: loads.sixtyPlus ?? null,
  };
}

test("a pair loading two bars the same way share one drawing", () => {
  const movement = barbell({ womenWomen: "30 kg" });
  const pair = [
    { name: "Sara Lastname", gender: "WOMAN" },
    { name: "Klara Lastname", gender: "WOMAN" },
  ];
  assert.deepEqual(laneLoads(movement, pair), [{ who: null, load: "30 kg", bar: 15 }]);
});

test("a man and a woman each lift their own", () => {
  const movement = barbell({ menMen: "42.5 kg", womenWomen: "30 kg" });
  assert.deepEqual(laneLoads(movement, [MAN, WOMAN]), [
    { who: "Oskar", load: "42.5 kg", bar: 20 },
    { who: "Anna", load: "30 kg", bar: 15 },
  ]);
});

// For a load everybody lifts their own of, the four columns are the four
// sorts of athlete: M, W, M60+, W60+. "Mixed" describes a pair, so it means
// nothing here and carries the 60+ man's load.
const FOUR = { menMen: "42.5 kg", womenWomen: "30 kg", mixed: "30 kg", sixtyPlus: "20 kg" };

test("a 60+ man lifts the 60+ men's load, not the 60+ women's", () => {
  const pair = [{ ...MAN, isSixtyPlus: true }, WOMAN];
  assert.deepEqual(laneLoads(barbell(FOUR), pair), [
    { who: "Oskar", load: "30 kg", bar: 20 },
    { who: "Anna", load: "30 kg", bar: 15 },
  ]);
});

test("a 60+ woman lifts the 60+ women's load", () => {
  const pair = [MAN, { ...WOMAN, isSixtyPlus: true }];
  assert.deepEqual(laneLoads(barbell(FOUR), pair), [
    { who: "Oskar", load: "42.5 kg", bar: 20 },
    { who: "Anna", load: "20 kg", bar: 15 },
  ]);
});

test("a 60+ athlete lifts the ordinary load where no 60+ one is written", () => {
  // The movement simply does not ease off for age. Better than a blank lane.
  const movement = barbell({ menMen: "42.5 kg", womenWomen: "30 kg" });
  const pair = [{ ...MAN, isSixtyPlus: true }, { ...WOMAN, isSixtyPlus: true }];
  assert.deepEqual(
    laneLoads(movement, pair).map((row) => row.load),
    ["42.5 kg", "30 kg"],
  );
});

test("a pair moving in sync both take the lighter weight", () => {
  // They have to be on one weight, and it cannot be one of them lifting more
  // than they would on their own.
  const movement = barbell({ menMen: "42.5 kg", womenWomen: "30 kg" }, "Synchro thrusters");
  assert.deepEqual(
    laneLoads(movement, [MAN, WOMAN]).map((row) => row.load),
    ["30 kg", "30 kg"],
  );
});

test("a movement with nothing written for anyone leaves the lane empty", () => {
  assert.deepEqual(laneLoads(barbell({}), [MAN, WOMAN]), []);
});

test("two kettlebells of the same weight are still two to fetch", () => {
  const movement = { ...barbell({ menMen: "32 kg" }), implement: "KETTLEBELL" };
  const pair = [MAN, { name: "Filip Lastname", gender: "MAN" }];
  assert.deepEqual(
    laneLoads(movement, pair).map((row) => row.who),
    ["Oskar", "Filip"],
  );
});

test("a sandbag shared by the team is one to fetch, not two", () => {
  const movement = {
    ...barbell({ mixed: "60 kg" }),
    implement: "SANDBAG",
    loadMode: "SHARED",
  };
  assert.deepEqual(laneLoads(movement, [MAN, WOMAN]), [
    { who: null, load: "60 kg", bar: 20 },
  ]);
});

test("a shared load nobody wrote is set halfway between the pair", () => {
  // One bag cannot be two weights at once, so it goes between them.
  const movement = {
    ...barbell({ menMen: "40 kg", womenWomen: "30 kg" }),
    implement: "SANDBAG",
    loadMode: "SHARED",
  };
  assert.deepEqual(laneLoads(movement, [MAN, WOMAN]), [
    { who: null, load: "35 kg", bar: 20 },
  ]);
});

test("halfway is worked out, not rounded to something tidy", () => {
  assert.equal(sharedLoad(["42.5 kg", "30 kg"]), "36.25 kg");
  assert.equal(sharedLoad(["70 kg", "50 kg"]), "60 kg");
  // A pair already on the same weight share exactly that.
  assert.equal(sharedLoad(["24 kg", "24 kg"]), "24 kg");
});

test("what the organiser wrote for the team beats working it out", () => {
  const movement = {
    ...barbell({ menMen: "40 kg", womenWomen: "30 kg", mixed: "32 kg" }),
    implement: "SANDBAG",
    loadMode: "SHARED",
  };
  assert.equal(laneLoads(movement, [MAN, WOMAN])[0].load, "32 kg");
});

test("halfway between two different sorts of thing is not invented", () => {
  // Nor between a distance and a weight, nor from something unreadable.
  assert.equal(sharedLoad(["60 cm", "40 kg"]), null);
  assert.equal(sharedLoad(["bodyweight", "40 kg"]), null);
  assert.equal(sharedLoad([]), null);
  // Centimetres halve as happily as kilos do.
  assert.equal(sharedLoad(["60 cm", "50 cm"]), "55 cm");
});

test("a shared load with nothing written anywhere stays empty", () => {
  const movement = { ...barbell({}), implement: "SANDBAG", loadMode: "SHARED" };
  assert.deepEqual(laneLoads(movement, [MAN, WOMAN]), []);
});

test("sync is spotted however it is written", () => {
  for (const name of [
    "Synchro burpees",
    "Synchronised wall balls",
    "Partner deadlift",
    "Squats together",
  ]) {
    assert.equal(isSynchronised(name), true, name);
  }
  for (const name of ["Thrusters", "Wall balls", "Calorie row"]) {
    assert.equal(isSynchronised(name), false, name);
  }
});

test("a 60+ team's shared bag sits between the two of them", () => {
  // The 60+ column is what that athlete carries alone, not what the pair
  // carry, so the bag is worked out rather than taken from the column.
  const movement = {
    ...barbell({ menMen: "70 kg", womenWomen: "50 kg", mixed: "60 kg", sixtyPlus: "40 kg" }),
    implement: "SANDBAG",
    loadMode: "SHARED",
  };
  // He is 60+ and would carry 40; she is not, and would carry 50.
  const pair = [{ ...MAN, isSixtyPlus: true }, WOMAN];
  assert.deepEqual(laneLoads(movement, pair), [
    { who: null, load: "45 kg", bar: 20 },
  ]);
});

test("a team who are both 60+ carry the full 60+ weight", () => {
  const movement = {
    ...barbell({ menMen: "70 kg", womenWomen: "50 kg", sixtyPlus: "40 kg" }),
    implement: "SANDBAG",
    loadMode: "SHARED",
  };
  const pair = [
    { ...MAN, isSixtyPlus: true },
    { ...WOMAN, isSixtyPlus: true },
  ];
  assert.equal(laneLoads(movement, pair)[0].load, "40 kg");
});

test("sync does not change a shared weight", () => {
  // One bag is one weight however they move, so a 60+ team still share the
  // weight between them rather than both dropping to the 60+ load.
  const movement = {
    ...barbell(
      { menMen: "70 kg", womenWomen: "50 kg", sixtyPlus: "40 kg" },
      "Partner sandbag carry",
    ),
    implement: "SANDBAG",
    loadMode: "SHARED",
  };
  const pair = [{ ...MAN, isSixtyPlus: true }, WOMAN];
  assert.equal(laneLoads(movement, pair)[0].load, "45 kg");
});

test("a station is one between the lane, anything else is one each", () => {
  const pair = [MAN, WOMAN];
  assert.equal(stationCount("ROWER", pair), 1);
  assert.equal(stationCount("PULL_UP_BAR", pair), 1);
  assert.equal(stationCount("BOX", pair), 1);
  // Nobody shares a rope mid-set.
  assert.equal(stationCount("JUMP_ROPE", pair), 2);
});

test("the heat on the floor is the first one nobody has scored", () => {
  const events = [
    { id: "e1", heats: [{ number: 1, done: true }, { number: 2, done: true }] },
    { id: "e2", heats: [{ number: 1, done: true }, { number: 2, done: false }] },
    { id: "e3", heats: [{ number: 1, done: false }] },
  ];
  assert.deepEqual(currentHeat(events), { eventId: "e2", heatNumber: 2 });
});

test("when everything is scored the screen stays on the last heat", () => {
  const events = [
    { id: "e1", heats: [{ number: 1, done: true }] },
    { id: "e2", heats: [{ number: 1, done: true }, { number: 2, done: true }] },
  ];
  assert.deepEqual(currentHeat(events), { eventId: "e2", heatNumber: 2 });
});

test("an event with no heats yet is skipped, not landed on", () => {
  const events = [
    { id: "e1", heats: [{ number: 1, done: true }] },
    { id: "e2", heats: [] },
  ];
  assert.deepEqual(currentHeat(events), { eventId: "e1", heatNumber: 1 });
});

test("a competition with no heats at all has nothing to show", () => {
  assert.equal(currentHeat([{ id: "e1", heats: [] }]), null);
});

// --- Heats kept to one division and class --------------------------------

test("a heat never mixes groups", () => {
  const entries = [
    { id: "a", group: "RX:WOMEN" },
    { id: "b", group: "RX:WOMEN" },
    { id: "c", group: "RX:MEN" },
    { id: "d", group: "RX:MEN" },
  ];
  const heats = heatsByGroup(entries, 3);
  assert.deepEqual(heats.map((h) => h.map((e) => e.id)), [["a", "b"], ["c", "d"]]);
});

test("a group is evened out, with the fuller heat last", () => {
  const five = ["1", "2", "3", "4", "5"].map((id) => ({ id, group: "RX:MIXED" }));
  assert.deepEqual(heatsByGroup(five, 3).map((h) => h.length), [2, 3]);
  const seven = Array.from({ length: 7 }, (_, i) => ({ id: String(i), group: "g" }));
  assert.deepEqual(heatsByGroup(seven, 3).map((h) => h.length), [2, 2, 3]);
});

test("a group that fills its heats exactly is left as it is", () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ id: String(i), group: "g" }));
  assert.deepEqual(heatsByGroup(six, 3).map((h) => h.length), [3, 3]);
});

// --- Last heat doesn't start the next event ------------------------------

const unit = (id: string, people: string[], group = "all") => ({ id, people, group });

test("nobody from the last heat is in the next event's first heat", () => {
  const heats = [
    [unit("a", ["anna"]), unit("b", ["bo"])],
    [unit("c", ["cia"]), unit("d", ["dan"])],
  ];
  const fixed = keepLastHeatOutOfFirst(heats, new Set(["anna"]));
  assert.deepEqual(fixed[0].map((u) => u.id), ["c", "b"]);
  assert.deepEqual(fixed[1].map((u) => u.id), ["a", "d"]);
});

test("a scramble team counts if anyone on it was in the last heat", () => {
  const heats = [[unit("t1", ["anna", "bo"])], [unit("t2", ["cia", "dan"])]];
  const fixed = keepLastHeatOutOfFirst(heats, new Set(["bo"]));
  assert.deepEqual(fixed.map((h) => h[0].id), ["t2", "t1"]);
});

test("swaps stay within the same division and class", () => {
  const heats = [[unit("a", ["anna"], "RX:W")], [unit("b", ["bo"], "RX:M")]];
  const fixed = keepLastHeatOutOfFirst(heats, new Set(["anna"]));
  assert.deepEqual(fixed.map((h) => h[0].id), ["a", "b"]);
});

test("one heat is left as it is", () => {
  const heats = [[unit("a", ["anna"]), unit("b", ["bo"])]];
  assert.deepEqual(keepLastHeatOutOfFirst(heats, new Set(["anna"])), heats);
});
