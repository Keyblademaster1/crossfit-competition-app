/**
 * Ranking and points.
 *
 * Nothing here touches the database or the screen. Give it scores, it gives
 * back standings. That makes it easy to test and easy to reason about.
 *
 * The rules come from SPEC.md:
 *  - Within an event, 1st place earns 1 point, 2nd earns 2, and so on.
 *  - Lowest total points wins overall.
 *  - Tied results inside an event share the rank and each earn the full points.
 *  - Overall ties break on best single-event finish, then next best, and so on.
 */

/** One result to be ranked. `unitId` is an athlete id or a team id. */
export interface RawScore {
  unitId: string;
  /**
   * The result as a whole number: seconds, reps or grams, depending on the
   * event. When `didNotFinish` is true this instead holds the work completed
   * (usually reps), because a capped workout is scored on how far you got.
   */
  value: number;
  /** Optional secondary time, in seconds, used to separate equal results. */
  tiebreakSeconds?: number | null;
  didNotFinish?: boolean;
}

export interface EventRanking {
  unitId: string;
  /** 1 is best. Tied units share a rank. */
  rank: number;
  /** Points earned. Equal to the rank. */
  points: number;
}

/**
 * Rank one event.
 *
 * Anyone who did not finish is placed below everyone who did, no matter how
 * good their partial result was. Among themselves, more work done ranks higher.
 */
export function rankEvent(
  scores: RawScore[],
  higherIsBetter: boolean,
): EventRanking[] {
  const sorted = [...scores].sort((a, b) => compareScores(a, b, higherIsBetter));

  const rankings: EventRanking[] = [];
  let currentRank = 0;

  sorted.forEach((score, index) => {
    const previous = sorted[index - 1];
    const tiedWithPrevious =
      previous !== undefined && compareScores(previous, score, higherIsBetter) === 0;

    // Standard competition ranking: two joint 1st places are followed by 3rd,
    // because the ranks they skipped are used up.
    currentRank = tiedWithPrevious ? currentRank : index + 1;

    rankings.push({ unitId: score.unitId, rank: currentRank, points: currentRank });
  });

  return rankings;
}

/** Negative means `a` places above `b`. Zero means a genuine tie. */
function compareScores(a: RawScore, b: RawScore, higherIsBetter: boolean): number {
  const aFinished = !a.didNotFinish;
  const bFinished = !b.didNotFinish;

  // Finishers always beat non-finishers.
  if (aFinished !== bFinished) return aFinished ? -1 : 1;

  if (!aFinished) {
    // Both stopped short, so whoever got further is ahead.
    if (a.value !== b.value) return b.value - a.value;
  } else if (a.value !== b.value) {
    return higherIsBetter ? b.value - a.value : a.value - b.value;
  }

  // Same result. A tiebreak time can still separate them: it is a time, so
  // lower is better. Someone without one cannot be placed above someone with.
  const aTiebreak = a.tiebreakSeconds ?? null;
  const bTiebreak = b.tiebreakSeconds ?? null;
  if (aTiebreak !== null && bTiebreak !== null && aTiebreak !== bTiebreak) {
    return aTiebreak - bTiebreak;
  }
  if (aTiebreak !== null && bTiebreak === null) return -1;
  if (aTiebreak === null && bTiebreak !== null) return 1;

  return 0;
}

export interface Standing {
  unitId: string;
  totalPoints: number;
  /** Points earned per event, keyed by event id. Missing means no score yet. */
  pointsByEvent: Record<string, number>;
  /** Every rank this unit earned, sorted best first. Used to break ties. */
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
export function buildStandings(events: EventScores[]): Standing[] {
  const totals = new Map<string, Standing>();

  const unitFor = (unitId: string): Standing => {
    let standing = totals.get(unitId);
    if (!standing) {
      standing = {
        unitId,
        totalPoints: 0,
        pointsByEvent: {},
        ranksBestFirst: [],
        position: 0,
      };
      totals.set(unitId, standing);
    }
    return standing;
  };

  for (const event of events) {
    for (const ranking of rankEvent(event.scores, event.higherIsBetter)) {
      const standing = unitFor(ranking.unitId);
      standing.totalPoints += ranking.points;
      standing.pointsByEvent[event.eventId] = ranking.points;
      standing.ranksBestFirst.push(ranking.rank);
    }
  }

  const standings = [...totals.values()];
  for (const standing of standings) {
    standing.ranksBestFirst.sort((a, b) => a - b);
  }

  standings.sort(compareStandings);

  let position = 0;
  standings.forEach((standing, index) => {
    const previous = standings[index - 1];
    const stillLevel = previous !== undefined && compareStandings(previous, standing) === 0;
    position = stillLevel ? position : index + 1;
    standing.position = position;
  });

  return standings;
}

function compareStandings(a: Standing, b: Standing): number {
  if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints;

  // Level on points: whoever has the better single event finish wins, then the
  // next best, and so on.
  const length = Math.max(a.ranksBestFirst.length, b.ranksBestFirst.length);
  for (let i = 0; i < length; i++) {
    const aRank = a.ranksBestFirst[i] ?? Infinity;
    const bRank = b.ranksBestFirst[i] ?? Infinity;
    if (aRank !== bRank) return aRank - bRank;
  }

  return 0;
}
