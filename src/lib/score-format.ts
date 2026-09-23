/**
 * Turning what a scorekeeper types into a number, and back again.
 *
 * Every score is stored as one whole number so results can be compared
 * directly. What the number means depends on the event:
 *
 *   TIME         seconds            "7:16"   -> 436
 *   REPS         repetitions        "154"    -> 154
 *   ROUNDS_REPS  total repetitions  "5+12"   -> 5 * repsPerRound + 12
 *   WEIGHT       grams              "102.5"  -> 102500
 *
 * Storing weight in grams rather than kilograms avoids decimals, which
 * computers cannot represent exactly and which therefore make sorting and
 * comparing unreliable.
 */

export type ScoreType = "TIME" | "TIME_OR_REPS" | "REPS" | "ROUNDS_REPS" | "WEIGHT";

export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

export interface ParseContext {
  scoreType: ScoreType;
  /** Required for ROUNDS_REPS so "5+12" can be turned into a total. */
  repsPerRound?: number | null;
}

export function parseScore(input: string, context: ParseContext): ParseResult {
  const text = input.trim();
  if (text === "") return { ok: false, error: "Enter a score" };

  switch (context.scoreType) {
    case "TIME":
    case "TIME_OR_REPS":
      // Both are typed as a time. A capped result is recorded as reps instead,
      // and the caller passes REPS for that.
      return parseTime(text);
    case "REPS":
      return parseWholeNumber(text, "reps");
    case "ROUNDS_REPS":
      return parseRoundsAndReps(text, context.repsPerRound);
    case "WEIGHT":
      return parseWeight(text);
  }
}

export function formatScore(value: number, context: ParseContext): string {
  switch (context.scoreType) {
    case "TIME":
    case "TIME_OR_REPS":
      return formatTime(value);
    case "REPS":
      return String(value);
    case "ROUNDS_REPS": {
      const perRound = context.repsPerRound ?? 0;
      if (perRound <= 0) return String(value);
      return `${Math.floor(value / perRound)}+${value % perRound}`;
    }
    case "WEIGHT":
      return formatWeight(value);
  }
}

/** Accepts "7:16", "1:02:30" or a plain number of seconds. */
function parseTime(text: string): ParseResult {
  const parts = text.split(":");
  if (parts.length > 3) return { ok: false, error: 'Use mm:ss, for example "7:16"' };

  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part.trim())) {
      return { ok: false, error: 'Use mm:ss, for example "7:16"' };
    }
    numbers.push(Number(part.trim()));
  }

  // Seconds and minutes may not spill over, or "1:75" would be ambiguous.
  if (numbers.length > 1 && numbers[numbers.length - 1] > 59) {
    return { ok: false, error: "Seconds must be under 60" };
  }
  if (numbers.length === 3 && numbers[1] > 59) {
    return { ok: false, error: "Minutes must be under 60" };
  }

  const seconds = numbers.reduce((total, part) => total * 60 + part, 0);
  return { ok: true, value: seconds };
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(remainder)}`
    : `${minutes}:${pad(remainder)}`;
}

function parseWholeNumber(text: string, noun: string): ParseResult {
  if (!/^\d+$/.test(text)) return { ok: false, error: `Enter ${noun} as a whole number` };
  return { ok: true, value: Number(text) };
}

/** Accepts "5+12", "5 + 12" or a plain total. */
function parseRoundsAndReps(text: string, repsPerRound?: number | null): ParseResult {
  if (!text.includes("+")) return parseWholeNumber(text, "reps");

  if (!repsPerRound || repsPerRound <= 0) {
    return {
      ok: false,
      error: "Add this event's movements before using the 5+12 format",
    };
  }

  const [roundsText, repsText] = text.split("+");
  const rounds = parseWholeNumber(roundsText.trim(), "rounds");
  if (!rounds.ok) return rounds;
  const reps = parseWholeNumber(repsText.trim(), "reps");
  if (!reps.ok) return reps;

  if (reps.value >= repsPerRound) {
    return {
      ok: false,
      error: `Leftover reps must be under ${repsPerRound}, or it is another full round`,
    };
  }

  return { ok: true, value: rounds.value * repsPerRound + reps.value };
}

/** Accepts kilograms, with a dot or a comma: "102.5" or "102,5". */
function parseWeight(text: string): ParseResult {
  const normalised = text.replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(normalised)) {
    return { ok: false, error: 'Enter kilograms, for example "102.5"' };
  }
  // Round because 102.5 * 1000 can land a hair off in binary arithmetic.
  return { ok: true, value: Math.round(Number(normalised) * 1000) };
}

export function formatWeight(grams: number): string {
  const kilos = grams / 1000;
  return Number.isInteger(kilos) ? `${kilos} kg` : `${kilos.toFixed(1)} kg`;
}
