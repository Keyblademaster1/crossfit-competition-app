import { db } from "@/lib/db";
import { buildStandings, type EventScores, type Standing } from "@/lib/scoring";
import { formatScore, type ScoreType } from "@/lib/score-format";

/**
 * Loads a competition's scores and works out the standings.
 *
 * Athletes are ranked against athletes in their own division, and teams
 * against teams, never across divisions. Which of the two is used depends on
 * the competition mode.
 */

export interface LeaderboardEvent {
  id: string;
  name: string;
  scoreType: ScoreType;
  repsPerRound: number | null;
}

export interface LeaderboardRow extends Standing {
  name: string;
  /** The result as the scorekeeper would read it, e.g. "7:16" or "CAP 186". */
  resultsByEvent: Record<string, string>;
}

export interface DivisionLeaderboard {
  divisionId: string | null;
  divisionName: string;
  rows: LeaderboardRow[];
}

export async function loadLeaderboard(
  competitionId: string,
): Promise<{ events: LeaderboardEvent[]; divisions: DivisionLeaderboard[] }> {
  const competition = await db.competition.findUnique({
    where: { id: competitionId },
    include: {
      divisions: { orderBy: [{ position: "asc" }, { name: "asc" }] },
      athletes: true,
      teams: { where: { eventId: null } },
      events: {
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: { scores: true },
      },
    },
  });

  if (!competition) throw new Error("Competition not found");

  const rules = {
    pointsSystem: competition.pointsSystem,
    eventTieRule: competition.eventTieRule,
  };

  const scoresByEvent: EventScores[] = competition.events.map((event) => ({
    eventId: event.id,
    higherIsBetter: event.higherIsBetter,
    scores: event.scores.map((score) => ({
      unitId: score.athleteId ?? score.teamId ?? "",
      value: score.value,
      tiebreakSeconds: score.tiebreakSeconds,
      status: score.status,
    })),
  }));

  // How each unit's result should be written out, per event.
  const displayByUnit = new Map<string, Record<string, string>>();
  for (const event of competition.events) {
    for (const score of event.scores) {
      const unitId = score.athleteId ?? score.teamId ?? "";
      const shown =
        score.status === "NO_SHOW"
          ? "DNS"
          : score.status === "CAPPED"
        ? `CAP ${score.value}`
        : formatScore(score.value, {
            scoreType: event.scoreType as ScoreType,
            repsPerRound: event.repsPerRound,
          });
      const existing = displayByUnit.get(unitId) ?? {};
      existing[event.id] = shown;
      displayByUnit.set(unitId, existing);
    }
  }

  const isScramble = competition.mode === "SCRAMBLE";
  const units = isScramble ? competition.athletes : competition.teams;

  const nameOf = new Map(units.map((unit) => [unit.id, unit.name]));
  const divisionOf = new Map(units.map((unit) => [unit.id, unit.divisionId]));

  const buckets: { id: string | null; name: string }[] = [
    ...competition.divisions.map((d) => ({ id: d.id as string | null, name: d.name })),
  ];
  // Scrambled and individual competitions have no divisions, so the one board
  // is simply everyone. Saying "no division" there reads like something is
  // missing rather than like a deliberate choice.
  const hasUnassigned = units.some((unit) => unit.divisionId === null);
  if (hasUnassigned || buckets.length === 0) {
    buckets.push({
      id: null,
      name: competition.divisions.length > 0
        ? "No division"
        : isScramble
          ? "Athletes"
          : "Teams",
    });
  }

  const divisions = buckets.map((bucket) => {
    const memberIds = new Set(
      units.filter((unit) => divisionOf.get(unit.id) === bucket.id).map((u) => u.id),
    );

    const scoped = scoresByEvent.map((event) => ({
      ...event,
      scores: event.scores.filter((score) => memberIds.has(score.unitId)),
    }));

    const rows: LeaderboardRow[] = buildStandings(scoped, rules).map((standing) => ({
      ...standing,
      name: nameOf.get(standing.unitId) ?? "Unknown",
      resultsByEvent: displayByUnit.get(standing.unitId) ?? {},
    }));

    // Anyone with no score yet still belongs on the board, at the bottom.
    const ranked = new Set(rows.map((row) => row.unitId));
    for (const id of memberIds) {
      if (!ranked.has(id)) {
        rows.push({
          unitId: id,
          name: nameOf.get(id) ?? "Unknown",
          totalPoints: 0,
          pointsByEvent: {},
          placesByEvent: {},
          ranksBestFirst: [],
          position: 0,
          resultsByEvent: {},
        });
      }
    }

    return { divisionId: bucket.id, divisionName: bucket.name, rows };
  });

  return {
    events: competition.events.map((event) => ({
      id: event.id,
      name: event.name,
      scoreType: event.scoreType as ScoreType,
      repsPerRound: event.repsPerRound,
    })),
    divisions: divisions.filter((division) => division.rows.length > 0),
  };
}
