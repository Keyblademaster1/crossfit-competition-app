/**
 * Working out a capped score from where someone got to.
 *
 * When a workout is capped, the scorekeeper should not be adding up reps in
 * their head between heats. They say where the athlete reached — "36 into the
 * burpees" — and the app adds the finished movements to it.
 *
 * The total is all that gets stored. Which movement that represents is worked
 * back out when the score is shown again, so there is nothing extra to keep in
 * the database and nothing that can fall out of step with the workout.
 */

export interface MovementLine {
  id: string;
  name: string;
  reps: number;
}

/**
 * Total reps completed by someone who reached `repsInto` reps of `movementId`.
 *
 * Everything before that movement was finished, so it all counts.
 */
export function totalRepsReached(
  movements: MovementLine[],
  movementId: string,
  repsInto: number,
): number {
  const index = movements.findIndex((movement) => movement.id === movementId);
  if (index === -1) return Math.max(0, repsInto);

  const before = movements
    .slice(0, index)
    .reduce((sum, movement) => sum + movement.reps, 0);

  // Going past the end of a movement means the next one was started, but the
  // scorekeeper said otherwise, so believe them and cap it at the movement.
  const into = Math.min(Math.max(0, repsInto), movements[index].reps);
  return before + into;
}

/** The reverse: given a total, say which movement it lands in and how far. */
export function whereTheyReached(
  movements: MovementLine[],
  total: number,
): { movementId: string; repsInto: number } | null {
  if (movements.length === 0) return null;

  let remaining = Math.max(0, total);
  for (const movement of movements) {
    if (remaining < movement.reps) {
      return { movementId: movement.id, repsInto: remaining };
    }
    remaining -= movement.reps;
  }

  // Past the end of the workout, which means they finished it. Show them at
  // the end of the last movement rather than nowhere.
  const last = movements[movements.length - 1];
  return { movementId: last.id, repsInto: last.reps };
}

/** "36 into Burpees", for showing a capped result back. */
export function describeReached(
  movements: MovementLine[],
  total: number,
): string {
  const reached = whereTheyReached(movements, total);
  if (!reached) return `${total} reps`;
  const movement = movements.find((m) => m.id === reached.movementId);
  if (!movement) return `${total} reps`;
  return `${reached.repsInto} into ${movement.name}`;
}

// --- Blocks ---------------------------------------------------------------
//
// An event is a stack of blocks, each with its own format and movements. See
// design/app/event-builder/HANDOFF.md.

export type BlockFormat =
  | "FOR_TIME"
  | "ROUNDS_FOR_TIME"
  | "AMRAP"
  | "EMOM"
  | "INTERVALS"
  | "LADDER"
  | "MAX_LOAD"
  | "REST";

export const FORMATS: Record<
  BlockFormat,
  {
    label: string;
    /** What the one setting means, or null when there is none. */
    settingLabel: string | null;
    /** Filled in when the block is created, from the design's examples. */
    defaultSetting: string | null;
    hasMovements: boolean;
    /** The reps column counts one round, not the whole block. */
    perRound: boolean;
  }
> = {
  FOR_TIME: { label: "For time", settingLabel: null, defaultSetting: null, hasMovements: true, perRound: false },
  ROUNDS_FOR_TIME: { label: "Rounds for time", settingLabel: "rounds", defaultSetting: "5", hasMovements: true, perRound: true },
  AMRAP: { label: "AMRAP", settingLabel: "minutes", defaultSetting: "12", hasMovements: true, perRound: true },
  EMOM: { label: "EMOM", settingLabel: "minutes", defaultSetting: "10", hasMovements: true, perRound: true },
  INTERVALS: { label: "Intervals", settingLabel: "work / rest", defaultSetting: "4 × 2:00 / 1:00", hasMovements: true, perRound: true },
  LADDER: { label: "Ladder", settingLabel: "rep scheme", defaultSetting: "21-15-9", hasMovements: true, perRound: false },
  MAX_LOAD: { label: "Max load", settingLabel: "window", defaultSetting: "6:00", hasMovements: true, perRound: false },
  REST: { label: "Rest", settingLabel: "minutes", defaultSetting: "2:00", hasMovements: false, perRound: false },
};

export const FORMAT_ORDER: BlockFormat[] = [
  "FOR_TIME",
  "ROUNDS_FOR_TIME",
  "AMRAP",
  "EMOM",
  "INTERVALS",
  "LADDER",
  "MAX_LOAD",
  "REST",
];

export type WorkSplit =
  | "ANYHOW"
  | "YOU_GO_I_GO"
  | "ALTERNATE_REPS"
  | "SYNCHRO"
  | "CONGA"
  | "RELAY"
  | "ONE_WORKS_ONE_HOLDS"
  | "BOTH_DO_ALL"
  | "SPLIT_50_50";

/** How a team shares the work: the menu label, and the words for a summary. */
export const SPLITS: { id: WorkSplit; label: string; says: string }[] = [
  { id: "ANYHOW", label: "Share anyhow", says: "share the reps anyhow" },
  { id: "YOU_GO_I_GO", label: "You go, I go · alternate rounds", says: "one round each, alternating" },
  { id: "ALTERNATE_REPS", label: "Alternate reps", says: "every other rep" },
  { id: "SYNCHRO", label: "Synchro · both together", says: "both at the same time" },
  { id: "CONGA", label: "Conga · one at a time, in order", says: "one at a time, in order" },
  { id: "RELAY", label: "Relay · one movement each", says: "one movement each" },
  { id: "ONE_WORKS_ONE_HOLDS", label: "One works, one holds", says: "one works while the other holds" },
  { id: "BOTH_DO_ALL", label: "Both do all the reps", says: "both do all the reps" },
  { id: "SPLIT_50_50", label: "Split 50/50", says: "half the reps each" },
];

export interface BlockPlan {
  id: string;
  format: BlockFormat;
  setting: string | null;
  split?: WorkSplit | null;
  movements: MovementLine[];
}

/** "5" rounds, from a rounds-for-time setting. At least one. */
export function roundsOf(setting: string | null): number {
  const rounds = parseInt(setting ?? "", 10);
  return Number.isFinite(rounds) && rounds > 0 ? rounds : 1;
}

/** "21-15-9" as [21, 15, 9]. Anything that is not a number is skipped. */
export function ladderScheme(setting: string | null): number[] {
  return (setting ?? "")
    .split(/[^0-9]+/)
    .map((part) => parseInt(part, 10))
    .filter((reps) => Number.isFinite(reps) && reps > 0);
}

const sumReps = (movements: MovementLine[]) =>
  movements.reduce((sum, movement) => sum + Math.max(0, movement.reps), 0);

/**
 * The reps in a block, the way the handoff counts them: a rounds-for-time
 * block counts every round, a ladder counts its scheme for each movement, an
 * AMRAP, EMOM or intervals block counts one round, and max load and rest add
 * nothing.
 */
export function repsInBlock(block: BlockPlan): number {
  switch (block.format) {
    case "ROUNDS_FOR_TIME":
      return sumReps(block.movements) * roundsOf(block.setting);
    case "LADDER":
      return (
        ladderScheme(block.setting).reduce((sum, reps) => sum + reps, 0) *
        block.movements.length
      );
    case "MAX_LOAD":
    case "REST":
      return 0;
    default:
      return sumReps(block.movements);
  }
}

/** The number in the strip at the top of the builder. */
export function totalReps(blocks: BlockPlan[]): number {
  return blocks.reduce((sum, block) => sum + repsInBlock(block), 0);
}

/**
 * Every rep of the workout in the order it is done, as lines a capped result
 * can be entered against: "36 into Burpees, round 3". A movement that comes
 * round more than once gets a line each time, so the finished rounds are
 * added on too. Ids are the movement's own when it appears once, and the
 * movement's id plus "#" and a count when it repeats.
 */
export function repSequence(blocks: BlockPlan[]): MovementLine[] {
  const lines: MovementLine[] = [];
  for (const block of blocks) {
    if (block.format === "MAX_LOAD" || block.format === "REST") continue;

    if (block.format === "ROUNDS_FOR_TIME" && roundsOf(block.setting) > 1) {
      const rounds = roundsOf(block.setting);
      for (let round = 1; round <= rounds; round++) {
        for (const movement of block.movements) {
          lines.push({
            id: `${movement.id}#${round}`,
            name: `${movement.name}, round ${round}`,
            reps: movement.reps,
          });
        }
      }
    } else if (block.format === "LADDER" && ladderScheme(block.setting).length > 0) {
      ladderScheme(block.setting).forEach((reps, step) => {
        for (const movement of block.movements) {
          lines.push({ id: `${movement.id}#${step + 1}`, name: `${reps} ${movement.name}`, reps });
        }
      });
    } else {
      lines.push(...block.movements);
    }
  }
  return lines;
}

/**
 * How an event is scored, worked out from its blocks rather than chosen.
 *
 * Every event is time if they finish and reps if the cap is hit, except two:
 * one made only of max-load work, which ranks on the heaviest lift (Carin's
 * call, 23 September 2026), and a lone AMRAP, which nobody finishes early and
 * which is entered as rounds + reps.
 */
export function scoringFor(blocks: BlockPlan[]): {
  scoreType: "TIME_OR_REPS" | "WEIGHT" | "ROUNDS_REPS";
  higherIsBetter: boolean;
  repsPerRound: number | null;
} {
  const work = blocks.filter((block) => block.format !== "REST");
  if (work.length > 0 && work.every((block) => block.format === "MAX_LOAD")) {
    return { scoreType: "WEIGHT", higherIsBetter: true, repsPerRound: null };
  }
  if (work.length === 1 && work[0].format === "AMRAP") {
    const perRound = sumReps(work[0].movements);
    return { scoreType: "ROUNDS_REPS", higherIsBetter: true, repsPerRound: perRound > 0 ? perRound : null };
  }
  return { scoreType: "TIME_OR_REPS", higherIsBetter: false, repsPerRound: null };
}

/** The line under a block: "30 reps per round · 12 minutes · one round each". */
export function blockSummary(block: BlockPlan, teams: boolean): string {
  if (!FORMATS[block.format].hasMovements) return "No work, just rest";
  const reps = sumReps(block.movements);
  const split = SPLITS.find((option) => option.id === block.split);
  const how = teams && split ? ` · ${split.says}` : "";
  switch (block.format) {
    case "AMRAP":
      return `${reps} reps per round · ${block.setting ?? "?"} minutes${how}`;
    case "EMOM":
      return `${reps} reps a minute · ${block.setting ?? "?"} minutes${how}`;
    case "ROUNDS_FOR_TIME":
      return `${roundsOf(block.setting)} × ${reps} reps = ${repsInBlock(block)} reps${how}`;
    case "LADDER":
      return `${ladderScheme(block.setting).join("-") || "?"} of each · ${repsInBlock(block)} reps${how}`;
    case "INTERVALS":
      return `${reps} reps per interval · ${block.setting ?? "?"}${how}`;
    case "MAX_LOAD":
      return `Heaviest lift in ${block.setting ?? "?"}${how}`;
    default:
      return `${reps} reps${how}`;
  }
}

/**
 * One division's version of a workout, out of all an event's blocks.
 *
 * Fixed-team competitions give each division (RX, Scaled) its own blocks.
 * Everywhere else there is one version, held with no division. Blocks with no
 * division count as the first division's, and the first division's count as
 * the one version, so an event keeps its workout when the competition's
 * format is changed either way.
 */
export function versionOf<T extends { divisionId: string | null }>(
  blocks: T[],
  divisionId: string | null,
  firstDivisionId: string | null,
): T[] {
  const same = (id: string | null) => id ?? firstDivisionId;
  return blocks.filter((block) => same(block.divisionId) === same(divisionId));
}
