import test from "node:test";
import assert from "node:assert/strict";
import { loadBar, readKilos, barFor, MENS_BAR, WOMENS_BAR } from "./plates.ts";

test("a 20 kg bar with nothing on it needs no plates", () => {
  assert.deepEqual(loadBar(20).perSide, []);
});

test("60 kg on a men's bar is a 20 on each side", () => {
  assert.deepEqual(loadBar(60).perSide, [20]);
});

test("heaviest plates go on first, so the fewest are used", () => {
  // 142.5 - 20 = 122.5, so 61.25 a side: 25 + 25 + 10 + 1.25
  assert.deepEqual(loadBar(142.5).perSide, [25, 25, 10, 1.25]);
});

test("42.5 kg on a men's bar", () => {
  // 22.5 to share, 11.25 a side: 10 + 1.25
  assert.deepEqual(loadBar(42.5).perSide, [10, 1.25]);
});

test("30 kg on a women's bar", () => {
  // 15 to share, 7.5 a side: 5 + 2.5
  assert.deepEqual(loadBar(30, WOMENS_BAR).perSide, [5, 2.5]);
});

test("the quarter kilos do not drift", () => {
  // Halving 1.25 repeatedly is where decimals go wrong, so check the total
  // adds back up exactly. A total is only loadable when what goes on the bar
  // divides into 2.5 kg, since the smallest plate is 1.25 and there are two.
  for (const total of [22.5, 25, 42.5, 62.5, 102.5, 147.5]) {
    const { perSide, bar, shortBy } = loadBar(total);
    const loaded = bar + perSide.reduce((sum, plate) => sum + plate, 0) * 2;
    assert.equal(shortBy, 0, `${total} should be loadable`);
    assert.equal(loaded, total, `${total} did not add back up`);
  }
});

test("a weight the plates cannot make up is reported, not hidden", () => {
  // 21 kg means half a kilo a side, and there is no half-kilo plate.
  const { perSide, shortBy } = loadBar(21);
  assert.deepEqual(perSide, []);
  assert.equal(shortBy, 1);
});

test("an odd quarter-kilo total cannot be loaded either", () => {
  // 21.25 needs 0.625 a side. It looks loadable because 1.25 is a real plate,
  // but only one of them would be needed and they go on in pairs.
  const { perSide, shortBy } = loadBar(21.25);
  assert.deepEqual(perSide, []);
  assert.equal(shortBy, 1.25);
});

test("less than the bar itself cannot be loaded", () => {
  const { perSide, shortBy } = loadBar(10, MENS_BAR);
  assert.deepEqual(perSide, []);
  assert.ok(shortBy < 0, "it should say the total is below the bar");
});

test("the bar depends on who is lifting", () => {
  assert.equal(barFor("WOMAN"), 15);
  assert.equal(barFor("MAN"), 20);
  assert.equal(barFor(null), 20);
});

test("loads are read out of what the organiser typed", () => {
  assert.equal(readKilos("42.5 kg"), 42.5);
  assert.equal(readKilos("42,5 kg"), 42.5);
  assert.equal(readKilos("70kg"), 70);
  assert.equal(readKilos("60 cm"), null, "a box height is not a weight");
  assert.equal(readKilos(null), null);
});
