/**
 * Whether a competition is split into divisions (RX, Scaled), each with its
 * own version of every workout, its own heats and its own leaderboard.
 *
 * Fixed teams always are. An individual competition is when the organiser
 * chooses it on the Format step (Carin, 29 October 2026). A scramble never
 * is: everyone is drawn together, and 60+ changes the loads instead.
 *
 * Every competition is made with RX and Scaled ready, so having division
 * rows says nothing; this does.
 */
export function hasDivisions(competition: {
  mode: string | null;
  individualDivisions: boolean;
}): boolean {
  return (
    competition.mode === "FIXED_TEAM" ||
    (competition.mode === "INDIVIDUAL" && competition.individualDivisions)
  );
}
