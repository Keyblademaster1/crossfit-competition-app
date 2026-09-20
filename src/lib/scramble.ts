/**
 * Drawing teams before an event.
 *
 * Two methods, per SPEC.md:
 *  - RANDOM: pure chance.
 *  - SNAKE:  best with worst, so teams come out roughly even in strength.
 *
 * Like the scoring module, this is plain data in and plain data out. The caller
 * decides who is in the pool — normally everyone in one division.
 */

export type ScrambleMethod = "RANDOM" | "SNAKE";

/** An athlete waiting to be placed on a team. */
export interface Drawable {
  athleteId: string;
  /**
   * Current leaderboard position, 1 being the best. Only SNAKE uses it.
   * Athletes with no standing yet should be given the worst position.
   */
  position: number;
}

export interface DrawnTeam {
  /** 1-based, for naming teams "Team 1", "Team 2", ... */
  index: number;
  athleteIds: string[];
}

export interface DrawOptions {
  method: ScrambleMethod;
  /** How many athletes per team. The last team may be smaller. */
  teamSize: number;
  /** Supply a fixed generator to get repeatable draws in tests. */
  random?: () => number;
}

export function drawTeams(pool: Drawable[], options: DrawOptions): DrawnTeam[] {
  const { method, teamSize, random = Math.random } = options;

  if (teamSize < 1) throw new Error("teamSize must be at least 1");
  if (pool.length === 0) return [];

  const teamCount = Math.ceil(pool.length / teamSize);
  const teams: DrawnTeam[] = Array.from({ length: teamCount }, (_, index) => ({
    index: index + 1,
    athleteIds: [],
  }));

  const ordered =
    method === "RANDOM"
      ? shuffle(pool, random)
      : [...pool].sort((a, b) => a.position - b.position);

  if (method === "RANDOM") {
    // Deal straight down the line: first teamSize athletes make team 1, and so on.
    ordered.forEach((athlete, index) => {
      teams[Math.floor(index / teamSize)].athleteIds.push(athlete.athleteId);
    });
    return teams;
  }

  // SNAKE: deal one athlete to each team in turn, then reverse direction and
  // deal back. The strongest and weakest end up together, so every team gets a
  // comparable spread of ability.
  //
  //   teams:   1  2  3
  //   round 1: 1  2  3   (best three athletes)
  //   round 2: 6  5  4   (next three, dealt backwards)
  //   round 3: 7  8  9
  ordered.forEach((athlete, index) => {
    const round = Math.floor(index / teamCount);
    const seat = index % teamCount;
    const teamIndex = round % 2 === 0 ? seat : teamCount - 1 - seat;
    teams[teamIndex].athleteIds.push(athlete.athleteId);
  });

  return teams;
}

/**
 * Fisher-Yates shuffle: walk the list from the end, swapping each item with a
 * randomly chosen earlier one. Every ordering is equally likely, which the
 * obvious `sort(() => Math.random() - 0.5)` trick does not actually give you.
 */
function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
