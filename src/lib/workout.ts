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

/**
 * How many reps make one full round of the workout, for a rounds + reps
 * score: every movement's reps added up, so "5+12" can be turned into a total
 * without anyone typing the round size in separately.
 *
 * Fixed-team competitions can give a division its own version of a movement;
 * the shared version counts, so a round is not counted twice. Null when there
 * are no movements yet, since there is nothing to add up.
 */
export function repsInOneRound(
  movements: { reps: number; divisionId?: string | null }[],
): number | null {
  const shared = movements.filter((movement) => !movement.divisionId);
  const counted = shared.length > 0 ? shared : movements;
  const total = counted.reduce((sum, movement) => sum + Math.max(0, movement.reps), 0);
  return total > 0 ? total : null;
}
