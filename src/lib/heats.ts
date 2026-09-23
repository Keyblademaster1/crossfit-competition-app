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

/**
 * What a movement's four load columns mean.
 *
 * They hold different things depending on how the load is lifted, because a
 * load that everyone lifts their own of depends on the athlete, and one that
 * a team shares depends on the pairing:
 *
 *   EACH    what one athlete lifts   M, W, M60+, W60+
 *   SHARED  what one team shares     M/M, W/W, Mixed, 60+
 *
 * "Mixed" describes a pair, so it means nothing for a load somebody lifts on
 * their own; that column carries the 60+ man's load instead. One list, used
 * by the event builder and by both screens, so they cannot disagree.
 */
export const INDIVIDUAL_LOADS = [
  { field: "loadMenMen", label: "M" },
  { field: "loadWomenWomen", label: "W" },
  { field: "loadMixed", label: "M60+" },
  { field: "loadSixtyPlus", label: "W60+" },
] as const;

export const TEAM_LOADS = [
  { field: "loadMenMen", label: "M/M" },
  { field: "loadWomenWomen", label: "W/W" },
  { field: "loadMixed", label: "Mixed" },
  { field: "loadSixtyPlus", label: "60+" },
] as const;

export function loadColumns(
  loadMode: string,
): readonly { field: keyof MovementLoads; label: string }[] {
  return loadMode === "SHARED" ? TEAM_LOADS : INDIVIDUAL_LOADS;
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
 * The lightest of several loads, or null if they cannot be compared.
 *
 * Used where a pair have to be on one weight: it is theirs to share, and
 * nobody can be asked to lift more than they would on their own.
 */
export function lightest(loads: string[]): string | null {
  if (loads.length === 0) return null;

  const parsed = loads.map(readLoad);
  if (parsed.some((entry) => entry === null)) return null;

  const entries = parsed as { amount: number; unit: string }[];
  if (new Set(entries.map((entry) => entry.unit.toLowerCase())).size > 1) return null;

  let best = 0;
  for (let i = 1; i < entries.length; i += 1) {
    if (entries[i].amount < entries[best].amount) best = i;
  }
  return loads[best];
}

/**
 * What one athlete lifts when everybody lifts their own.
 *
 * Decided by who they are rather than who they are paired with. An athlete
 * recorded as neither a man nor a woman takes the men's load, which is also
 * the bar they are given.
 */
function individualLoad(movement: MovementLoads, person: Person): string | null {
  const woman = person.gender === "WOMAN";
  // Where nobody wrote a 60+ load, the movement does not ease off for age, so
  // they lift the ordinary one rather than the lane showing nothing.
  if (person.isSixtyPlus) {
    return woman
      ? (movement.loadSixtyPlus ?? movement.loadWomenWomen)
      : (movement.loadMixed ?? movement.loadMenMen);
  }
  return woman ? movement.loadWomenWomen : movement.loadMenMen;
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
  const rows =
    movement.loadMode === "SHARED"
      ? sharedRows(movement, people)
      : individualRows(movement, people);
  if (rows.length < 2) return rows;

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

/** Everybody lifts their own, so the load follows the athlete. */
function individualRows(movement: MovementLoads, people: Person[]): LaneLoad[] {
  const rows: LaneLoad[] = [];
  for (const person of people) {
    const load = individualLoad(movement, person);
    if (load === null) continue;
    rows.push({ who: person.name.split(" ")[0], load, bar: barFor(person.gender) });
  }
  if (rows.length === 0) return [];

  // Moving in time with each other means being on one weight, and the only
  // one they can both make is the lighter.
  if (isSynchronised(movement.name)) {
    const one = lightest(rows.map((row) => row.load));
    if (one !== null) return rows.map((row) => ({ ...row, load: one }));
  }
  return rows;
}

/** One thing between the team, so the load follows the pairing. */
function sharedRows(movement: MovementLoads, people: Person[]): LaneLoad[] {
  const category = teamCategory(
    people.map((person) => person.gender),
    people.some((person) => person.isSixtyPlus),
  );

  // The M/M, W/W and Mixed columns say what that sort of pair share, so where
  // one is written it stands. The 60+ column is different: it is one athlete's
  // own weight, not a weight for a pair, so a 60+ team's is always worked out
  // from the two of them.
  const written = category.label === "60+" ? null : movement[category.field];
  const load =
    written ??
    sharedLoad(
      people
        .map((person) => loadFor(movement, category, person))
        .filter((entry): entry is string => entry !== null),
    );
  return load ? [{ who: null, load, bar: barFor(people[0]?.gender) }] : [];
}

/**
 * What one athlete would carry alone, for working out a shared weight.
 *
 * In a 60+ team it is the 60+ athlete who drops to the lighter load; their
 * partner would carry their own.
 */
function loadFor(
  movement: MovementLoads,
  category: TeamCategory,
  person: Person,
): string | null {
  if (category.label === "60+" && !person.isSixtyPlus) {
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

/**
 * Splits whoever is on the floor into heats, keeping groups apart: in fixed
 * teams a heat only ever holds one division and one class, so an all-women
 * RX team never shares the floor with a men's or mixed team, or with Scaled.
 *
 * Entries come in the running order wanted (groups already in order, and
 * within a group worst first or shuffled). Each group gets as few heats as
 * its size allows, evened out so no team is left alone in a last heat: five
 * teams on three lanes run as two and three, the fuller heat last.
 */
export function heatsByGroup<T extends { group: string }>(entries: T[], lanes: number): T[][] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);

  const heats: T[][] = [];
  for (const members of groups.values()) {
    const count = Math.ceil(members.length / Math.max(1, lanes));
    const size = Math.floor(members.length / count);
    const bigger = members.length % count; // the last this many heats take one more
    let start = 0;
    for (let heat = 0; heat < count; heat++) {
      const take = size + (heat >= count - bigger ? 1 : 0);
      heats.push(members.slice(start, start + take));
      start += take;
    }
  }
  return heats;
}

/**
 * "Last heat doesn't start the next event": nobody who was in the previous
 * event's last heat is in this event's first heat, so the leaders do not go
 * twice running. Anyone who would be swaps with someone from the nearest
 * later heat of the same group (division and class, for fixed teams), which
 * moves the running order as little as possible. When there is no one to
 * swap with — a single heat — it is left as it is.
 */
export function keepLastHeatOutOfFirst<T extends { group: string; people: string[] }>(
  heats: T[][],
  lastHeat: Set<string>,
): T[][] {
  const result = heats.map((heat) => [...heat]);
  if (result.length < 2 || lastHeat.size === 0) return result;
  const wasLast = (entry: T) => entry.people.some((person) => lastHeat.has(person));

  const first = result[0];
  for (let i = 0; i < first.length; i++) {
    if (!wasLast(first[i])) continue;
    for (let h = 1; h < result.length; h++) {
      const j = result[h].findIndex((entry) => entry.group === first[i].group && !wasLast(entry));
      if (j === -1) continue;
      [first[i], result[h][j]] = [result[h][j], first[i]];
      break;
    }
  }
  return result;
}
