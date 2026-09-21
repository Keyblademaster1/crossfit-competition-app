/**
 * Reading forms.
 *
 * These live apart from the actions in actions.ts so they can be tested on
 * their own. Both have already been the source of a real bug: one sent the
 * setup wizard back to the step it was on so Continue did nothing, and the
 * other treated a box that had not been filled in yet as an instruction to
 * delete the result.
 */

export type ScoreStatus = "FINISHED" | "CAPPED" | "NO_SHOW";

export function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

export function optionalNumber(formData: FormData, field: string): number | null {
  const raw = text(formData, field);
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * Which step of the setup wizard to show next.
 *
 * Continue and the steps in the left-hand list all post where they want to go.
 * A button that posts nothing, such as "Add athlete", leaves the organiser
 * where they are.
 */
export function nextStep(
  formData: FormData,
  current: number,
  lastStep = 5,
): number {
  const raw = text(formData, "goto");
  if (raw === "") return current;
  const asked = Number(raw);
  if (!Number.isFinite(asked)) return current;
  return Math.max(0, Math.min(lastStep, Math.round(asked)));
}

export interface ScoreInput {
  /** The result as text, ready for score-format.ts. Empty means none given. */
  raw: string;
  status: ScoreStatus;
}

/**
 * Pulls a result out of the score entry form.
 *
 * The screen gives the scorekeeper separate boxes — minutes and seconds, or
 * rounds and reps — because that is quicker to type than punctuation. They are
 * joined back into the single piece of text that score-format.ts understands,
 * so only one place knows how a score is read.
 */
export function readScoreInput(formData: FormData, scoreType: string): ScoreInput {
  const chosen = text(formData, "status");
  const status: ScoreStatus =
    chosen === "CAPPED" ? "CAPPED" : chosen === "NO_SHOW" ? "NO_SHOW" : "FINISHED";

  // A no-show has no result, but still needs a row so it can be given its
  // penalty points.
  if (status === "NO_SHOW") return { raw: "0", status };

  // A capped result is recorded as the reps completed, whatever the event
  // normally measures.
  if (status === "CAPPED") {
    return { raw: text(formData, "reps") || text(formData, "value"), status };
  }

  if (scoreType === "TIME" || scoreType === "TIME_OR_REPS") {
    const minutes = text(formData, "minutes");
    const seconds = text(formData, "seconds");
    if (minutes !== "" || seconds !== "") {
      // Half a time is not a time. Treat it as nothing given, so autosave
      // partway through typing does not record 5:00 as 5:undefined.
      if (minutes === "" || seconds === "") return { raw: "", status };
      return { raw: `${minutes}:${seconds.padStart(2, "0")}`, status };
    }
  }

  if (scoreType === "ROUNDS_REPS") {
    const rounds = text(formData, "rounds");
    const reps = text(formData, "reps");
    if (rounds !== "" || reps !== "") {
      if (rounds === "") return { raw: reps, status };
      return { raw: `${rounds}+${reps || "0"}`, status };
    }
  }

  return { raw: text(formData, "value"), status };
}

/**
 * Whether an empty box means "remove this result".
 *
 * Only when the result is marked finished, which is a deliberate clear. An
 * empty box on a capped result means the reps have not been typed yet, and
 * wiping the previous result would lose the scorekeeper's work.
 */
export function clearsScore(input: ScoreInput): boolean {
  return input.raw === "" && input.status === "FINISHED";
}
