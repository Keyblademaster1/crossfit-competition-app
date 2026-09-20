import { db } from "@/lib/db";
import { buildStandings, type EventScores, type Standing } from "@/lib/scoring";

/**
 * Loads a competition's scores and works out the standings.
 *
 * Athletes are ranked against athletes in their own division, and teams
 * against teams, never across divisions. Which of the two is used depends on
 * the competition mode.
 */

export interface LeaderboardRow extends Standing {
  name: string;
}

export interface DivisionLeaderboard {
  divisionId: string | null;
  divisionName: string;
  rows: LeaderboardRow[];
}

export async function loadLeaderboard(
  competitionId: string,
): Promise<{ eventNames: { id: string; name: string }[]; divisions: DivisionLeaderboard[] }> {
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

  const scoresByEvent: EventScores[] = competition.events.map((event) => ({
    eventId: event.id,
    higherIsBetter: event.higherIsBetter,
    scores: event.scores.map((score) => ({
      unitId: score.athleteId ?? score.teamId ?? "",
      value: score.value,
      tiebreakSeconds: score.tiebreakSeconds,
      didNotFinish: score.didNotFinish,
    })),
  }));

  const isScramble = competition.mode === "SCRAMBLE";
  const units = isScramble ? competition.athletes : competition.teams;

  const nameOf = new Map(units.map((unit) => [unit.id, unit.name]));
  const divisionOf = new Map(units.map((unit) => [unit.id, unit.divisionId]));

  // Rank inside each division separately.
  const buckets: { id: string | null; name: string }[] = [
    ...competition.divisions.map((d) => ({ id: d.id as string | null, name: d.name })),
  ];
  const hasUnassigned = units.some((unit) => unit.divisionId === null);
  if (hasUnassigned || buckets.length === 0) {
    buckets.push({ id: null, name: "No division" });
  }

  const divisions = buckets.map((bucket) => {
    const memberIds = new Set(
      units.filter((unit) => divisionOf.get(unit.id) === bucket.id).map((u) => u.id),
    );

    const scoped = scoresByEvent.map((event) => ({
      ...event,
      scores: event.scores.filter((score) => memberIds.has(score.unitId)),
    }));

    const rows = buildStandings(scoped).map((standing) => ({
      ...standing,
      name: nameOf.get(standing.unitId) ?? "Unknown",
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
          ranksBestFirst: [],
          position: 0,
        });
      }
    }

    return {
      divisionId: bucket.id,
      divisionName: bucket.name,
      rows,
    };
  });

  return {
    eventNames: competition.events.map((event) => ({ id: event.id, name: event.name })),
    divisions: divisions.filter((division) => division.rows.length > 0),
  };
}
