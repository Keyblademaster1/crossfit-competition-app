/**
 * Putting things in the order a person reads them.
 *
 * A database sorts names as text, which puts "Team 10" between "Team 1" and
 * "Team 2". Nobody notices below ten teams. At ten it starts misleading the
 * person entering scores, who works down the list while a heat is on the
 * floor, and reads the printed team sheet the same way.
 */

/** Compares two names, reading runs of digits in them as numbers. */
export function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}
