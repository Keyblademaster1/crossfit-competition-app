import test from "node:test";
import assert from "node:assert/strict";
import {
  teamCategory,
  laneLoads,
  currentHeat,
  isSynchronised,
  stationCount,
  sharedLoad,
} from "./heats.ts";

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

const MAN = { name: "Oskar Nyström", gender: "MAN" };
const WOMAN = { name: "Anna Svensson", gender: "WOMAN" };

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
    { name: "Sara Holm", gender: "WOMAN" },
    { name: "Klara Persson", gender: "WOMAN" },
  ];
  assert.deepEqual(laneLoads(movement, pair), [{ who: null, load: "30 kg", bar: 15 }]);
});

test("a mixed pair on the mixed load still needs two different bars", () => {
  const movement = barbell({ mixed: "30 kg" });
  assert.deepEqual(laneLoads(movement, [MAN, WOMAN]), [
    { who: "Oskar", load: "30 kg", bar: 20 },
    { who: "Anna", load: "30 kg", bar: 15 },
  ]);
});

test("with no mixed load written, each of the pair lifts their own", () => {
  // The point of the rule: leaving the mixed column blank means pairing makes
  // no difference to this movement, not that the lane has nothing to set out.
  const movement = barbell({ menMen: "42.5 kg", womenWomen: "30 kg" });
  assert.deepEqual(laneLoads(movement, [MAN, WOMAN]), [
    { who: "Oskar", load: "42.5 kg", bar: 20 },
    { who: "Anna", load: "30 kg", bar: 15 },
  ]);
});

test("a 60+ team with no 60+ load written falls back the same way", () => {
  const movement = barbell({ menMen: "42.5 kg", womenWomen: "30 kg" });
  const pair = [{ ...MAN, isSixtyPlus: true }, WOMAN];
  assert.deepEqual(laneLoads(movement, pair), [
    { who: "Oskar", load: "42.5 kg", bar: 20 },
    { who: "Anna", load: "30 kg", bar: 15 },
  ]);
});

test("a team load, where there is one, beats the individual loads", () => {
  // A mixed pair with a mixed load written both lift it, rather than falling
  // back to their own. The 60+ team is the exception, tested below.
  const movement = barbell({ menMen: "42.5 kg", womenWomen: "30 kg", mixed: "35 kg" });
  assert.deepEqual(
    laneLoads(movement, [MAN, WOMAN]).map((row) => row.load),
    ["35 kg", "35 kg"],
  );
});

test("a movement with nothing written for anyone leaves the lane empty", () => {
  assert.deepEqual(laneLoads(barbell({}), [MAN, WOMAN]), []);
});

test("two kettlebells of the same weight are still two to fetch", () => {
  const movement = { ...barbell({ menMen: "32 kg" }), implement: "KETTLEBELL" };
  const pair = [MAN, { name: "Filip Åberg", gender: "MAN" }];
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

test("in a 60+ team only the 60+ athlete drops to the lighter load", () => {
  // The partner is not 60+, so nothing about them changed: they lift what
  // they would have lifted anyway.
  const movement = barbell({ menMen: "42.5 kg", womenWomen: "30 kg", sixtyPlus: "20 kg" });
  const pair = [{ ...MAN, isSixtyPlus: true }, WOMAN];
  assert.deepEqual(laneLoads(movement, pair), [
    { who: "Oskar", load: "20 kg", bar: 20 },
    { who: "Anna", load: "30 kg", bar: 15 },
  ]);
});

test("a movement done in sync puts the whole 60+ team on the 60+ load", () => {
  // There is no synchronising a 30 kg bar with a 20 kg one.
  const movement = barbell(
    { menMen: "42.5 kg", womenWomen: "30 kg", sixtyPlus: "20 kg" },
    "Synchro thrusters",
  );
  const pair = [{ ...MAN, isSixtyPlus: true }, WOMAN];
  assert.deepEqual(
    laneLoads(movement, pair).map((row) => row.load),
    ["20 kg", "20 kg"],
  );
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
