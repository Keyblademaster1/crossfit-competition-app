/**
 * The setup wizard's steps, in the order an organiser goes through them.
 * Everything that names a step uses these, never a bare number, so the
 * order can change in this one place.
 *
 * The order follows how a competition is planned (Carin, 26 October 2026):
 * the format first, because the event builder needs to know it; then the
 * events, all set up well in advance; then the athletes, who sign up over
 * the weeks before. Heats are not part of setup at all: they are worked out
 * on the day, or the day before, from each event's heats page.
 */
export const SETUP = {
  basics: 0,
  format: 1,
  scoring: 2,
  events: 3,
  athletes: 4,
  sharing: 5,
} as const;

export const LAST_SETUP_STEP = SETUP.sharing;

/** The steps' names, in order, for the list down the side. */
export const SETUP_STEP_NAMES = [
  "The basics",
  "Format & teams",
  "Scoring rules",
  "Events",
  "Athletes",
  "Screens & sharing",
];
