/**
 * Drawing teams before an event.
 *
 * The organiser picks how teams are put together, and can add rules on top:
 * avoid giving people the same partner twice, aim for mixed or same-gender
 * pairs, and spread the 60+ athletes around rather than letting them clump.
 *
 * Those rules pull against each other, and with a real set of athletes they
 * often cannot all be satisfied. So the draw does not try to be perfect: it
 * deals the teams out, then repeatedly makes whichever single swap improves
 * matters most, and stops when no swap helps. Whatever is left unsatisfied is
 * reported rather than hidden, so the organiser can decide what to do.
 *
 * Like the scoring module, this is plain data in and plain data out.
 */

export type ScrambleMethod = "RANDOM" | "SNAKE" | "HALVES";
export type TeammateRule = "ALWAYS_DIFFERENT" | "AVOID_REPEATS" | "ALLOW_REPEATS";
export type DrawGender = "IGNORE" | "MIXED" | "SAME";
export type Gender = "WOMAN" | "MAN" | "OTHER";

/** An athlete waiting to be placed on a team. */
export interface Drawable {
  athleteId: string;
  /**
   * Current leaderboard position, 1 being the best. Athletes with no standing
   * yet should be given the worst position.
   */
  position: number;
  gender?: Gender | null;
  isSixtyPlus?: boolean;
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
  teammateRule?: TeammateRule;
  drawGender?: DrawGender;
  spreadSixtyPlus?: boolean;
  /** Pairs who have already been teammates, as keys from `pairKey`. */
  previousPairs?: ReadonlySet<string>;
  /** Supply a fixed generator to get repeatable draws in tests. */
  random?: () => number;
}

export interface DrawResult {
  teams: DrawnTeam[];
  /** How many swaps were made to satisfy the rules. */
  swaps: number;
  /** Rules that could not be fully satisfied, in plain words. */
  warnings: string[];
}

/** A stable key for a pair of athletes, whichever order they are given in. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function drawTeams(pool: Drawable[], options: DrawOptions): DrawResult {
  const {
    method,
    teamSize,
    teammateRule = "ALLOW_REPEATS",
    drawGender = "IGNORE",
    spreadSixtyPlus = false,
    previousPairs = new Set<string>(),
    random = Math.random,
  } = options;

  if (teamSize < 1) throw new Error("teamSize must be at least 1");
  if (pool.length === 0) return { teams: [], swaps: 0, warnings: [] };

  const teamCount = Math.ceil(pool.length / teamSize);
  const seats = deal(pool, teamCount, teamSize, method, random);

  const rules: Rules = {
    teammateRule,
    drawGender,
    spreadSixtyPlus,
    previousPairs,
    // Spread evenly: with 5 sixty-plus athletes across 3 teams, 2 each is the
    // best anyone can do.
    maxSixtyPlusPerTeam: Math.ceil(
      pool.filter((a) => a.isSixtyPlus).length / teamCount,
    ),
  };

  const swaps = improve(seats, rules);

  return {
    teams: seats.map((members, index) => ({
      index: index + 1,
      athleteIds: members.map((m) => m.athleteId),
    })),
    swaps,
    warnings: describeRemaining(seats, rules),
  };
}

/** Puts athletes into teams before any of the rules are considered. */
function deal(
  pool: Drawable[],
  teamCount: number,
  teamSize: number,
  method: ScrambleMethod,
  random: () => number,
): Drawable[][] {
  const teams: Drawable[][] = Array.from({ length: teamCount }, () => []);

  if (method === "RANDOM") {
    // Deal straight down the line: the first teamSize athletes make team 1.
    shuffle(pool, random).forEach((athlete, index) => {
      teams[Math.floor(index / teamSize)].push(athlete);
    });
    return teams;
  }

  const ranked = [...pool].sort((a, b) => a.position - b.position);

  if (method === "HALVES") {
    // Cut the standings in half and pair like for like: the best of the top
    // half with the best of the bottom half. Every team then has someone from
    // each end, but the teams are not all equally strong the way SNAKE makes
    // them — the first team is the strongest.
    const half = Math.ceil(ranked.length / 2);
    const top = ranked.slice(0, half);
    const bottom = ranked.slice(half);
    const queue = [...top, ...bottom];
    let cursor = 0;
    for (let seat = 0; seat < teamSize; seat++) {
      for (let team = 0; team < teamCount; team++) {
        if (cursor < queue.length) teams[team].push(queue[cursor++]);
      }
    }
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
  ranked.forEach((athlete, index) => {
    const round = Math.floor(index / teamCount);
    const seat = index % teamCount;
    teams[round % 2 === 0 ? seat : teamCount - 1 - seat].push(athlete);
  });
  return teams;
}

interface Rules {
  teammateRule: TeammateRule;
  drawGender: DrawGender;
  spreadSixtyPlus: boolean;
  previousPairs: ReadonlySet<string>;
  maxSixtyPlusPerTeam: number;
}

/**
 * How badly one team breaks the rules. Zero is perfect.
 *
 * The weights say which rule gives way first when they conflict: a repeated
 * partner under "always different" is treated as worse than a gender mismatch,
 * which is worse than 60+ athletes bunching up.
 */
function teamCost(team: Drawable[], rules: Rules): number {
  let cost = 0;

  const repeatWeight =
    rules.teammateRule === "ALWAYS_DIFFERENT"
      ? 10
      : rules.teammateRule === "AVOID_REPEATS"
        ? 4
        : 0;

  if (repeatWeight > 0) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        if (rules.previousPairs.has(pairKey(team[i].athleteId, team[j].athleteId))) {
          cost += repeatWeight;
        }
      }
    }
  }

  if (rules.drawGender !== "IGNORE" && team.length > 1) {
    const known = team.map((a) => a.gender).filter(Boolean) as Gender[];
    if (known.length > 1) {
      const allSame = known.every((g) => g === known[0]);
      // MIXED wants at least two genders present; SAME wants exactly one.
      if (rules.drawGender === "MIXED" && allSame) cost += 3;
      if (rules.drawGender === "SAME" && !allSame) cost += 3;
    }
  }

  if (rules.spreadSixtyPlus) {
    const sixtyPlus = team.filter((a) => a.isSixtyPlus).length;
    if (sixtyPlus > rules.maxSixtyPlusPerTeam) {
      cost += sixtyPlus - rules.maxSixtyPlusPerTeam;
    }
  }

  return cost;
}

function totalCost(teams: Drawable[][], rules: Rules): number {
  return teams.reduce((sum, team) => sum + teamCost(team, rules), 0);
}

/**
 * Swaps athletes between teams for as long as it keeps helping.
 *
 * Each pass tries every possible swap and takes the single best one. That is
 * not guaranteed to find the perfect arrangement, but it is quick, it never
 * makes things worse, and for a room full of athletes it gets there or close.
 */
function improve(teams: Drawable[][], rules: Rules): number {
  const limit = 200;
  let swaps = 0;

  while (swaps < limit) {
    const before = totalCost(teams, rules);
    if (before === 0) break;

    let best: { a: number; i: number; b: number; j: number; cost: number } | null = null;

    for (let a = 0; a < teams.length; a++) {
      for (let b = a + 1; b < teams.length; b++) {
        for (let i = 0; i < teams[a].length; i++) {
          for (let j = 0; j < teams[b].length; j++) {
            swapMembers(teams, a, i, b, j);
            const after = totalCost(teams, rules);
            swapMembers(teams, a, i, b, j); // put them back

            if (after < before && (best === null || after < best.cost)) {
              best = { a, i, b, j, cost: after };
            }
          }
        }
      }
    }

    if (!best) break;
    swapMembers(teams, best.a, best.i, best.b, best.j);
    swaps += 1;
  }

  return swaps;
}

function swapMembers(teams: Drawable[][], a: number, i: number, b: number, j: number) {
  const held = teams[a][i];
  teams[a][i] = teams[b][j];
  teams[b][j] = held;
}

/** Says, in plain words, which rules the draw could not fully satisfy. */
function describeRemaining(teams: Drawable[][], rules: Rules): string[] {
  const warnings: string[] = [];

  let repeated = 0;
  let genderMismatch = 0;
  let clumped = 0;

  for (const team of teams) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        if (rules.previousPairs.has(pairKey(team[i].athleteId, team[j].athleteId))) {
          repeated += 1;
        }
      }
    }

    if (rules.drawGender !== "IGNORE" && team.length > 1) {
      const known = team.map((a) => a.gender).filter(Boolean) as Gender[];
      if (known.length > 1) {
        const allSame = known.every((g) => g === known[0]);
        if (rules.drawGender === "MIXED" && allSame) genderMismatch += 1;
        if (rules.drawGender === "SAME" && !allSame) genderMismatch += 1;
      }
    }

    if (rules.spreadSixtyPlus) {
      const sixtyPlus = team.filter((a) => a.isSixtyPlus).length;
      if (sixtyPlus > rules.maxSixtyPlusPerTeam) clumped += 1;
    }
  }

  if (repeated > 0 && rules.teammateRule !== "ALLOW_REPEATS") {
    warnings.push(
      `${repeated} ${repeated === 1 ? "pair has" : "pairs have"} been teammates before. There are not enough athletes to avoid it.`,
    );
  }
  if (genderMismatch > 0) {
    warnings.push(
      `${genderMismatch} ${genderMismatch === 1 ? "team is" : "teams are"} not ${rules.drawGender === "MIXED" ? "mixed" : "same gender"}. The numbers do not allow it.`,
    );
  }
  if (clumped > 0) {
    warnings.push(
      `${clumped} ${clumped === 1 ? "team has" : "teams have"} more than their share of 60+ athletes.`,
    );
  }

  return warnings;
}

/**
 * Fisher-Yates shuffle: walk the list from the end, swapping each item with a
 * randomly chosen earlier one. Every ordering is equally likely, which the
 * obvious `sort(() => Math.random() - 0.5)` trick does not actually give you.
 */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Checks teams that have already been drawn against the rules.
 *
 * The draw happens on one request and the screen is rendered on the next, so
 * rather than carry the warnings between them, the screen asks the same
 * question again of the teams it is about to show.
 */
export function reviewTeams(
  teams: Drawable[][],
  options: Omit<DrawOptions, "method" | "teamSize"> & { totalAthletes: number },
): string[] {
  const rules: Rules = {
    teammateRule: options.teammateRule ?? "ALLOW_REPEATS",
    drawGender: options.drawGender ?? "IGNORE",
    spreadSixtyPlus: options.spreadSixtyPlus ?? false,
    previousPairs: options.previousPairs ?? new Set<string>(),
    maxSixtyPlusPerTeam: Math.ceil(
      teams.flat().filter((a) => a.isSixtyPlus).length / Math.max(1, teams.length),
    ),
  };
  return describeRemaining(teams, rules);
}
