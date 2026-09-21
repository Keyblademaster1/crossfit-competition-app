/**
 * The order the screens are used in on competition day.
 *
 * Once the events are built, running the thing is a loop: draw the teams for
 * an event, set out the heats, enter the scores, then start again on the next
 * event. Knowing the order in one place means every screen can offer a
 * Continue button that goes to the right next thing.
 *
 * A competition with fixed teams has nothing to draw, so that step drops out.
 */

export type Step = "draw" | "heats" | "score";

export interface FlowEvent {
  id: string;
  name: string;
}

export interface Place {
  eventId: string;
  step: Step;
}

export interface NextPlace extends Place {
  /** What the button should say, written as an instruction. */
  label: string;
  /** True when this moves on to a different event. */
  newEvent: boolean;
}

function stepsFor(scrambles: boolean): Step[] {
  return scrambles ? ["draw", "heats", "score"] : ["heats", "score"];
}

function describe(step: Step, eventName: string): string {
  switch (step) {
    case "draw":
      return `Draw teams for ${eventName}`;
    case "heats":
      return `Set the heats for ${eventName}`;
    case "score":
      return `Enter scores for ${eventName}`;
  }
}

/**
 * What comes after where you are now, or null at the end of the competition.
 */
export function nextInFlow(
  events: FlowEvent[],
  here: Place,
  scrambles: boolean,
): NextPlace | null {
  const steps = stepsFor(scrambles);
  const eventIndex = events.findIndex((event) => event.id === here.eventId);
  if (eventIndex === -1) return null;

  const stepIndex = steps.indexOf(here.step);
  // A step that does not belong to this kind of competition — the draw in a
  // fixed-team competition — starts the event from its first real step.
  if (stepIndex === -1) {
    return {
      eventId: here.eventId,
      step: steps[0],
      label: describe(steps[0], events[eventIndex].name),
      newEvent: false,
    };
  }

  if (stepIndex + 1 < steps.length) {
    const step = steps[stepIndex + 1];
    return {
      eventId: here.eventId,
      step,
      label: describe(step, events[eventIndex].name),
      newEvent: false,
    };
  }

  const nextEvent = events[eventIndex + 1];
  if (!nextEvent) return null;

  return {
    eventId: nextEvent.id,
    step: steps[0],
    label: describe(steps[0], nextEvent.name),
    newEvent: true,
  };
}

/** Where a step lives, so a button can link to it. */
export function pathFor(competitionId: string, place: Place): string {
  const base = `/competitions/${competitionId}/events/${place.eventId}`;
  if (place.step === "draw") return `${base}/draw`;
  if (place.step === "heats") return `${base}/heats`;
  return base;
}
