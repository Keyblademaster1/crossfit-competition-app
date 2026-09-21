import Link from "next/link";
import { nextInFlow, pathFor, type FlowEvent, type Step } from "@/lib/competition-flow";

/**
 * The button that walks through a competition.
 *
 * Draw the teams, set the heats, enter the scores, then the same again for the
 * next event. Whoever is running the day should be able to keep pressing one
 * button rather than remembering what comes next.
 */
export function ContinueButton({
  competitionId,
  events,
  eventId,
  step,
  scrambles,
}: {
  competitionId: string;
  events: FlowEvent[];
  eventId: string;
  step: Step;
  scrambles: boolean;
}) {
  const next = nextInFlow(events, { eventId, step }, scrambles);

  // Nothing after the last event's scores but the final standings.
  if (!next) {
    return (
      <Link
        href={`/competitions/${competitionId}/screen/leaderboard`}
        className="flex items-center rounded-lg px-6 font-semibold text-white"
        style={{ height: 48, background: "var(--brand-primary)" }}
      >
        Finish · show the leaderboard →
      </Link>
    );
  }

  return (
    <Link
      href={pathFor(competitionId, next)}
      className="flex items-center rounded-lg px-6 font-semibold text-white"
      style={{ height: 48, background: "var(--brand-primary)" }}
    >
      {next.label} →
    </Link>
  );
}
