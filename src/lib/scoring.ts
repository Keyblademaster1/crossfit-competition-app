/**
 * Ranking and points.
 *
 * Nothing here touches the database or the screen. Give it scores and the
 * competition's rules, and it gives back standings. That makes it easy to test
 * and easy to reason about.
 *
 * Two things are configurable, both chosen in the setup wizard:
 *
 *  - How a place turns into points. Either 100 for the winner with even steps
 *    down and the highest total winning, or 1 for the winner with the lowest
 *    total winning.
 *  - What happens when two results in an event are exactly the same.
 */

export type ScoreStatus = "FINISHED" | "CAPPED" | "NO_SHOW";
export type PointsSystem = "HUNDRED_STEPS" | "PLACING";
export type EventTieRule = "SHARE_HIGHER" | "TIEBREAK_TIME" | "SHARE_AVERAGE";

export interface ScoringRules {
  pointsSystem: PointsSystem;
  eventTieRule: EventTieRule;
}

export const defaultRules: ScoringRules = {
  pointsSystem: "HUNDRED_STEPS",
  eventTieRule: "SHARE_HIGHER",
};

/** One result to be ranked. `unitId` is an athlete id or a team id. */
export interface RawScore {
  unitId: string;
  /**
   * The result as a whole number: seconds, reps or grams, depending on the
   * event. For a capped result this is instead the work completed, because a
   * capped workout is scored on how far you got.
   */
  value: number;
  /** Optional secondary time, in seconds, used to separate equal results. */
  tiebreakSeconds?: number | null;
  /** Defaults to FINISHED. */
  status?: ScoreStatus;
}

export interface EventRanking {
  unitId: string;
  /** 1 is best. Tied units share a rank. */
  rank: number;
  points: number;
}

/**
 * Points awarded for finishing in a given place.
 *
 * With the hundred-step system the gap between places depends on how many
 * entered: with 12 entries the step is 8, so the places run 100, 92, 84 and so
 * on. That keeps a win worth the same in every event however many took part.
 */
export function pointsForPlace(
  place: number,
  entrants: number,
  system: PointsSystem,
): number {
  if (system === "PLACING") return place;
  const step = Math.floor(100 / Math.max(1, entrants));
  return Math.max(0, 100 - (place - 1) * step);
}

/** What a no-show earns. Nothing at all, or a place behind everyone else. */
export function noShowPoints(entrants: number, system: PointsSystem): number {
  return system === "PLACING" ? entrants + 1 : 0;
}

/** True when the highest total wins the competition. */
export function higherTotalWins(system: PointsSystem): boolean {
  return system === "HUNDRED_STEPS";
}

/**
 * Rank one event.
 *
 * Anyone who did not finish is placed below everyone who did, no matter how
 * good their partial result was, and a no-show below that.
 */
export function rankEvent(
  scores: RawScore[],
  higherIsBetter: boolean,
  rules: ScoringRules = defaultRules,
): EventRanking[] {
  const entrants = scores.length;
  if (entrants === 0) return [];

  const compare = (a: RawScore, b: RawScore) =>
    compareScores(a, b, higherIsBetter, rules.eventTieRule);

  const sorted = [...scores].sort(compare);

  const rankings: EventRanking[] = [];
  let place = 1;
  let index = 0;

  while (index < sorted.length) {
    // Collect everyone level with this result.
    let size = 1;
    while (index + size < sorted.length && compare(sorted[index], sorted[index + size]) === 0) {
      size += 1;
    }

    const group = sorted.slice(index, index + size);
    const isNoShow = statusOf(group[0]) === "NO_SHOW";

    let points: number;
    if (isNoShow) {
      points = noShowPoints(entrants, rules.pointsSystem);
    } else if (rules.eventTieRule === "SHARE_AVERAGE" && size > 1) {
      // Split the places they occupy evenly between them.
      let total = 0;
      for (let offset = 0; offset < size; offset++) {
        total += pointsForPlace(place + offset, entrants, rules.pointsSystem);
      }
      points = total / size;
    } else {
      points = pointsForPlace(place, entrants, rules.pointsSystem);
    }

    for (const score of group) {
      rankings.push({ unitId: score.unitId, rank: place, points });
    }

    // Standard competition ranking: two joint 1st places are followed by 3rd,
    // because the place they skipped is used up.
    place += size;
    index += size;
  }

  return rankings;
}

function statusOf(score: RawScore): ScoreStatus {
  return score.status ?? "FINISHED";
}

/** How far down the order a status puts you, before results are compared. */
function statusOrder(status: ScoreStatus): number {
  return status === "FINISHED" ? 0 : status === "CAPPED" ? 1 : 2;
}

/** Negative means `a` places above `b`. Zero means they are level. */
function compareScores(
  a: RawScore,
  b: RawScore,
  higherIsBetter: boolean,
  tieRule: EventTieRule,
): number {
  const aStatus = statusOf(a);
  const bStatus = statusOf(b);

  if (aStatus !== bStatus) return statusOrder(aStatus) - statusOrder(bStatus);

  // Two no-shows are simply level; there is nothing to compare.
  if (aStatus === "NO_SHOW") return 0;

  if (aStatus === "CAPPED") {
    // Both stopped short, so whoever got further is ahead.
    if (a.value !== b.value) return b.value - a.value;
  } else if (a.value !== b.value) {
    return higherIsBetter ? b.value - a.value : a.value - b.value;
  }

  // Same result. Only the tiebreak-time rule lets a secondary time separate
  // them; the other rules treat them as genuinely level.
  if (tieRule === "TIEBREAK_TIME") {
    const aTiebreak = a.tiebreakSeconds ?? null;
    const bTiebreak = b.tiebreakSeconds ?? null;
    // It is a time, so lower is better. Someone without one cannot be placed
    // above someone who has one.
    if (aTiebreak !== null && bTiebreak !== null && aTiebreak !== bTiebreak) {
      return aTiebreak - bTiebreak;
    }
    if (aTiebreak !== null && bTiebreak === null) return -1;
    if (aTiebreak === null && bTiebreak !== null) return 1;
  }

  return 0;
}

export interface Standing {
  unitId: string;
  totalPoints: number;
  /** Points earned per event, keyed by event id. Missing means no score yet. */
  pointsByEvent: Record<string, number>;
  /**
   * The place taken in each event, keyed by event id. The same numbers as
   * `ranksBestFirst`, kept against the event they were earned in, which is
   * what a results sheet has to print beside each result.
   */
  placesByEvent: Record<string, number>;
  /** Every place this unit took, sorted best first. Used to break ties. */
  ranksBestFirst: number[];
  /** 1 is best. Units that are still exactly level share a position. */
  position: number;
}

export interface EventScores {
  eventId: string;
  higherIsBetter: boolean;
  scores: RawScore[];
}

/**
 * Build the leaderboard from every event's scores.
 *
 * Call this fresh each time rather than storing the result. Correcting a score
 * then fixes the whole leaderboard with no extra work.
 */
export function buildStandings(
  events: EventScores[],
  rules: ScoringRules = defaultRules,
): Standing[] {
  const totals = new Map<string, Standing>();

  const unitFor = (unitId: string): Standing => {
    let standing = totals.get(unitId);
    if (!standing) {
      standing = {
        unitId,
        totalPoints: 0,
        pointsByEvent: {},
        placesByEvent: {},
        ranksBestFirst: [],
        position: 0,
      };
      totals.set(unitId, standing);
    }
    return standing;
  };

  for (const event of events) {
    for (const ranking of rankEvent(event.scores, event.higherIsBetter, rules)) {
      const standing = unitFor(ranking.unitId);
      standing.totalPoints += ranking.points;
      standing.pointsByEvent[event.eventId] = ranking.points;
      standing.placesByEvent[event.eventId] = ranking.rank;
      standing.ranksBestFirst.push(ranking.rank);
    }
  }

  const standings = [...totals.values()];
  for (const standing of standings) {
    standing.ranksBestFirst.sort((a, b) => a - b);
    // Averaged ties can land on a fraction of a point. Round for display so a
    // total does not read as 271.99999999999994.
    standing.totalPoints = Math.round(standing.totalPoints * 100) / 100;
  }

  const compare = (a: Standing, b: Standing) => compareStandings(a, b, rules.pointsSystem);
  standings.sort(compare);

  let position = 0;
  standings.forEach((standing, index) => {
    const previous = standings[index - 1];
    const stillLevel = previous !== undefined && compare(previous, standing) === 0;
    position = stillLevel ? position : index + 1;
    standing.position = position;
  });

  return standings;
}

function compareStandings(a: Standing, b: Standing, system: PointsSystem): number {
  if (a.totalPoints !== b.totalPoints) {
    return higherTotalWins(system)
      ? b.totalPoints - a.totalPoints
      : a.totalPoints - b.totalPoints;
  }

  // Level on points: whoever has the better single event placing wins, then
  // the next best, and so on.
  const length = Math.max(a.ranksBestFirst.length, b.ranksBestFirst.length);
  for (let i = 0; i < length; i++) {
    const aRank = a.ranksBestFirst[i] ?? Infinity;
    const bRank = b.ranksBestFirst[i] ?? Infinity;
    if (aRank !== bRank) return aRank - bRank;
  }

  return 0;
}

/** One line describing how points work, for the bottom of a leaderboard. */
export function describePointsSystem(system: PointsSystem): string {
  return system === "HUNDRED_STEPS"
    ? "Highest total wins · 100 for 1st, even steps down · no-show scores 0"
    : "Lowest total wins · 1 point for 1st, 2 for 2nd · no-show gets last place + 1";
}

/** How a tie inside an event is settled, in words. */
export function describeTieRule(rule: EventTieRule): string {
  switch (rule) {
    case "SHARE_HIGHER":
      return "Identical results share the higher place";
    case "TIEBREAK_TIME":
      return "Identical results are split by tiebreak time";
    case "SHARE_AVERAGE":
      return "Identical results share the average of the places";
  }
}
