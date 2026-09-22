/**
 * Heats: which one is on the floor, and what each lane needs on it.
 *
 * Two screens ask the same questions of a heat — the admin heats page and the
 * workout screen on the TV — so the answers live here rather than in either of
 * them. All of it is plain functions over plain data: no database, no React.
 */

import { barFor } from "./plates.ts";

/** Which sort of pair a team is, which is what decides its loads. */
export interface TeamCategory {
  label: string;
  /** The column on a Movement holding this category's load. */
  field: "loadMenMen" | "loadWomenWomen" | "loadMixed" | "loadSixtyPlus";
}

export function teamCategory(
  genders: (string | null)[],
  anySixtyPlus: boolean,
): TeamCategory {
  if (anySixtyPlus) return { label: "60+", field: "loadSixtyPlus" };
  const known = genders.filter(Boolean);
  if (known.length > 1 && known.every((g) => g === "MAN")) {
    return { label: "M/M", field: "loadMenMen" };
  }
  if (known.length > 1 && known.every((g) => g === "WOMAN")) {
    return { label: "W/W", field: "loadWomenWomen" };
  }
  return { label: "Mixed", field: "loadMixed" };
}

export interface Person {
  name: string;
  gender: string | null;
  isSixtyPlus?: boolean;
}

/** The load columns of a movement, which is all this file needs of one. */
export interface MovementLoads {
  name: string;
  loadMode: string;
  implement: string;
  loadMenMen: string | null;
  loadWomenWomen: string | null;
  loadMixed: string | null;
  loadSixtyPlus: string | null;
}

/** One thing to set out in a lane: whose it is, and what it is set to. */
export interface LaneLoad {
  /** Whose it is, or null when everyone in the lane has the same. */
  who: string | null;
  /** The load as the organiser wrote it: "42.5 kg", or "60 cm". */
  load: string;
  /** The bar that person lifts. Only meaningful for a barbell. */
  bar: number;
}

/**
 * Whether a movement is done in time with a partner.
 *
 * It matters because two athletes moving together have to be on the same
 * weight — there is no synchronising a 42.5 kg bar with a 20 kg one. So a
 * synchronised movement overrides the usual rule that a 60+ athlete drops to
 * the lighter load while their partner keeps their own.
 *
 * Read off the movement's name, because nothing else in the workout says it.
 * If the guessing ever gets in the way, this is the thing to replace with a
 * switch in the event builder.
 */
export function isSynchronised(name: string): boolean {
  return /\b(sync|partner|together|simultaneous)/i.test(name);
}

/**
 * Equipment a lane has one of however many athletes are in it.
 *
 * A rower, a rig and a box are stations: the pair take turns at them. That is
 * also why a movement counted in calories or metres is one effort split
 * between them rather than one each. A rope is not a station — everybody
 * needs their own.
 */
export function isStation(implement: string): boolean {
  return implement === "ROWER" || implement === "PULL_UP_BAR" || implement === "BOX";
}

/** How many of a thing a lane needs when there is no weight to go with it. */
export function stationCount(implement: string, people: Person[]): number {
  return isStation(implement) ? 1 : Math.max(1, people.length);
}

/**
 * A load split into its number and its unit: "42.5 kg" becomes 42.5 and "kg".
 *
 * Loads are free text, because they are not always a weight, so anything that
 * is not a plain number with a unit after it comes back as null rather than
 * being guessed at.
 */
function readLoad(text: string): { amount: number; unit: string } | null {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]*)\s*$/.exec(text);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  return Number.isFinite(amount) ? { amount, unit: match[2] } : null;
}

/**
 * One weight for a pair who would lift different weights on their own.
 *
 * There is only one bag, so it cannot be two weights at once: it is set
 * halfway between them. A man on 40 and a woman on 30 share 35.
 *
 * Only works on loads that are plainly comparable — the same unit, and both
 * of them numbers. Halfway between "60 cm" and "40 kg" is not a thing, and
 * inventing one would be worse than saying nothing.
 */
export function sharedLoad(loads: string[]): string | null {
  if (loads.length === 0) return null;

  const parsed = loads.map(readLoad);
  if (parsed.some((entry) => entry === null)) return null;

  const entries = parsed as { amount: number; unit: string }[];
  if (new Set(entries.map((entry) => entry.unit.toLowerCase())).size > 1) return null;

  const average =
    entries.reduce((total, entry) => total + entry.amount, 0) / entries.length;
  // Halving can land a hair off in binary arithmetic, so round it back.
  const tidy = Math.round(average * 100) / 100;
  return entries[0].unit ? `${tidy} ${entries[0].unit}` : String(tidy);
}

/**
 * The load an athlete lifts when the team has none of its own.
 *
 * Their own category: a man lifts the men's load, a woman the women's. An
 * athlete recorded as neither falls back to the mixed column, which is the
 * one written for pairs that are not simply one or the other.
 */
function ownLoad(movement: MovementLoads, person: Person): string | null {
  if (person.gender === "MAN") return movement.loadMenMen;
  if (person.gender === "WOMAN") return movement.loadWomenWomen;
  return movement.loadMixed;
}

/**
 * Everything one lane has to set out for one movement.
 *
 * The load is the team's own where the organiser wrote one — a mixed pair
 * lifting the mixed load, a 60+ team the 60+ load. Where they did not, the
 * pair simply lift their own weights: the man the men's load and the woman
 * the women's. That is the common case for a movement where pairing makes no
 * difference, and leaving the column blank should not leave the lane blank.
 *
 * A shared load is the exception: there is only one bag between the team, so
 * there is nothing to split and no sensible weight to invent.
 */
export function laneLoads(movement: MovementLoads, people: Person[]): LaneLoad[] {
  const category = teamCategory(
    people.map((person) => person.gender),
    people.some((person) => person.isSixtyPlus),
  );

  const together = isSynchronised(movement.name);

  if (movement.loadMode === "SHARED") {
    // The M/M, W/W and Mixed columns say what that sort of pair share, so
    // where one is written it stands. The 60+ column is different: it is one
    // athlete's own weight, not a weight for a pair, so a 60+ team's is
    // always worked out from the two of them.
    //
    // Sync makes no difference here. There is one object, so they are on the
    // same weight whether they move together or not.
    const written = category.label === "60+" ? null : movement[category.field];
    const load =
      written ??
      sharedLoad(
        people
          .map((person) => loadFor(movement, category, person, false))
          .filter((entry): entry is string => entry !== null),
      );
    return load ? [{ who: null, load, bar: barFor(people[0]?.gender) }] : [];
  }

  const rows: LaneLoad[] = [];
  for (const person of people) {
    const load = loadFor(movement, category, person, together);
    if (load === null) continue;
    rows.push({ who: person.name.split(" ")[0], load, bar: barFor(person.gender) });
  }
  if (rows.length === 0) return [];

  // A bar is drawn rather than counted: a pair loading two bars the same way
  // need one picture between them. Anything else is a separate thing to go and
  // fetch, so two kettlebells of the same weight are still listed twice.
  const identical = rows.every(
    (row) => row.load === rows[0].load && row.bar === rows[0].bar,
  );
  return movement.implement === "BARBELL" && identical
    ? [{ ...rows[0], who: null }]
    : rows;
}

/**
 * What one athlete in a lane lifts.
 *
 * In a 60+ team it is the 60+ athlete who drops to the lighter load; their
 * partner keeps their own. The exception is a movement done in sync, where
 * both of them have to be on the same weight, so the team's 60+ load covers
 * the pair.
 */
function loadFor(
  movement: MovementLoads,
  category: TeamCategory,
  person: Person,
  together: boolean,
): string | null {
  if (category.label === "60+" && !together && !person.isSixtyPlus) {
    return ownLoad(movement, person) ?? movement.loadSixtyPlus;
  }
  return movement[category.field] ?? ownLoad(movement, person);
}

/* ------------------------------------------------------------------ */

/** One heat, and whether everyone in it has a result yet. */
export interface HeatProgress {
  number: number;
  done: boolean;
}

export interface EventProgress {
  id: string;
  heats: HeatProgress[];
}

/**
 * Which heat is on the floor now.
 *
 * The big screen has to guess this, because nobody is going to walk over to
 * the laptop and tell it. The guess is simply: the first heat anywhere in the
 * competition that has not been scored yet. Scores are entered right after a
 * heat comes off the floor, so the first unscored heat is the one running, or
 * the one about to.
 *
 * Once everything is scored there is no such heat, and the screen should sit
 * on the last one that ran rather than jumping back to the start of the day.
 */
export function currentHeat(
  events: EventProgress[],
): { eventId: string; heatNumber: number } | null {
  for (const event of events) {
    const waiting = event.heats.find((heat) => !heat.done);
    if (waiting) return { eventId: event.id, heatNumber: waiting.number };
  }

  const last = [...events].reverse().find((event) => event.heats.length > 0);
  if (!last) return null;
  return { eventId: last.id, heatNumber: last.heats[last.heats.length - 1].number };
}
