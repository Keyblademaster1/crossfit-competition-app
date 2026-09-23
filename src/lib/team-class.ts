/**
 * A fixed team's class: all men, all women, or mixed.
 *
 * In fixed-team competitions a team is only ranked against, and only shares
 * a heat with, teams of the same division (RX, Scaled) and the same class, so
 * an all-women team never competes against an all-men or mixed one (Carin,
 * 23 September 2026). The class is worked out from the members' sex rather
 * than chosen, so it cannot disagree with who is actually on the team.
 */

export type TeamClass = "MEN" | "WOMEN" | "MIXED";

/** In the order the boards and heats run. */
export const TEAM_CLASSES: { id: TeamClass; label: string }[] = [
  { id: "WOMEN", label: "W/W" },
  { id: "MEN", label: "M/M" },
  { id: "MIXED", label: "Mixed" },
];

/**
 * Null while it cannot be known: a team with nobody on it yet, or anyone
 * whose sex has not been set. Guessing would put a team in the wrong class.
 */
export function teamClass(sexes: (string | null)[]): TeamClass | null {
  if (sexes.length === 0 || sexes.some((sex) => sex !== "MAN" && sex !== "WOMAN")) return null;
  if (sexes.every((sex) => sex === "MAN")) return "MEN";
  if (sexes.every((sex) => sex === "WOMAN")) return "WOMEN";
  return "MIXED";
}

export function classLabel(id: TeamClass | null): string {
  return TEAM_CLASSES.find((option) => option.id === id)?.label ?? "Class not known";
}
