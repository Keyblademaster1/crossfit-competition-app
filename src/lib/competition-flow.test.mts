import test from "node:test";
import assert from "node:assert/strict";
import { nextInFlow, pathFor } from "./competition-flow.ts";

const EVENTS = [
  { id: "e1", name: "The Chipper" },
  { id: "e2", name: "AMRAP 12" },
];

test("a scramble draws teams, then heats, then scores", () => {
  assert.equal(nextInFlow(EVENTS, { eventId: "e1", step: "draw" }, true)?.step, "heats");
  assert.equal(nextInFlow(EVENTS, { eventId: "e1", step: "heats" }, true)?.step, "score");
});

test("after the scores it starts the next event by drawing again", () => {
  const next = nextInFlow(EVENTS, { eventId: "e1", step: "score" }, true);
  assert.deepEqual(
    { eventId: next?.eventId, step: next?.step, newEvent: next?.newEvent },
    { eventId: "e2", step: "draw", newEvent: true },
  );
});

test("fixed teams have nothing to draw, so heats come first", () => {
  const next = nextInFlow(EVENTS, { eventId: "e1", step: "score" }, false);
  assert.deepEqual({ eventId: next?.eventId, step: next?.step }, { eventId: "e2", step: "heats" });
});

test("the last event ends the competition", () => {
  assert.equal(nextInFlow(EVENTS, { eventId: "e2", step: "score" }, true), null);
  assert.equal(nextInFlow(EVENTS, { eventId: "e2", step: "score" }, false), null);
});

test("the button says what it is about to do", () => {
  assert.equal(
    nextInFlow(EVENTS, { eventId: "e1", step: "heats" }, true)?.label,
    "Enter scores for The Chipper",
  );
  assert.equal(
    nextInFlow(EVENTS, { eventId: "e1", step: "score" }, true)?.label,
    "Draw teams for AMRAP 12",
  );
});

test("standing on a draw in a fixed-team competition sends you to the heats", () => {
  // There is no draw step to be on, so it starts the event properly.
  const next = nextInFlow(EVENTS, { eventId: "e1", step: "draw" }, false);
  assert.deepEqual({ eventId: next?.eventId, step: next?.step }, { eventId: "e1", step: "heats" });
});

test("an event that is not in the list leads nowhere", () => {
  assert.equal(nextInFlow(EVENTS, { eventId: "gone", step: "score" }, true), null);
});

test("each step has its own address", () => {
  assert.equal(pathFor("c1", { eventId: "e1", step: "draw" }), "/competitions/c1/events/e1/draw");
  assert.equal(pathFor("c1", { eventId: "e1", step: "heats" }), "/competitions/c1/events/e1/heats");
  assert.equal(pathFor("c1", { eventId: "e1", step: "score" }), "/competitions/c1/events/e1");
});
