"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { parseScore, type ScoreType } from "@/lib/score-format";
import type { ScoreStatus } from "@/lib/scoring";
import { drawTeams, pairKey, type ScrambleMethod } from "@/lib/scramble";
import { loadLeaderboard } from "@/lib/leaderboard";

/**
 * Everything that writes to the database.
 *
 * "use server" at the top of the file marks these as Server Actions: they run
 * on the server even when a form on the page calls them. The browser never
 * sees the database or the password.
 *
 * Because they can be called directly, each one re-checks its own input rather
 * than trusting whatever arrives.
 */

function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

function optionalNumber(formData: FormData, field: string): number | null {
  const raw = text(formData, field);
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value) : null;
}

export async function createCompetition(formData: FormData) {
  const name = text(formData, "name");
  if (name === "") throw new Error("A competition needs a name");

  const mode = text(formData, "mode") === "FIXED_TEAM" ? "FIXED_TEAM" : "SCRAMBLE";
  const teamSize = optionalNumber(formData, "teamSize");

  const competition = await db.competition.create({
    data: {
      name,
      mode,
      teamSize: mode === "SCRAMBLE" ? (teamSize ?? 2) : null,
      // A competition with no divisions still needs somewhere to put people.
      divisions: {
        create: [
          { name: "RX Women", position: 1 },
          { name: "RX Men", position: 2 },
        ],
      },
    },
  });

  redirect(`/competitions/${competition.id}`);
}

export async function addDivision(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const name = text(formData, "name");
  if (name === "") return;

  const count = await db.division.count({ where: { competitionId } });
  await db.division.create({
    data: { competitionId, name, position: count + 1 },
  });

  revalidatePath(`/competitions/${competitionId}`);
}

export async function addAthlete(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const name = text(formData, "name");
  const divisionId = text(formData, "divisionId") || null;
  if (name === "") return;

  await db.athlete.create({ data: { competitionId, name, divisionId } });
  revalidatePath(`/competitions/${competitionId}`);
}

export async function deleteAthlete(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  await db.athlete.delete({ where: { id: text(formData, "athleteId") } });
  revalidatePath(`/competitions/${competitionId}`);
  revalidatePath(`/competitions/${competitionId}/setup`);
}

export async function addTeam(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const name = text(formData, "name");
  const divisionId = text(formData, "divisionId") || null;
  if (name === "") return;

  await db.team.create({ data: { competitionId, name, divisionId, eventId: null } });
  revalidatePath(`/competitions/${competitionId}`);
}

export async function addEvent(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  await addEventRow(formData, competitionId);
  revalidatePath(`/competitions/${competitionId}`);
}

async function addEventRow(formData: FormData, competitionId: string) {
  const name = text(formData, "name");
  if (name === "") return;

  const scoreType = text(formData, "scoreType") as ScoreType;
  const count = await db.event.count({ where: { competitionId } });

  await db.event.create({
    data: {
      competitionId,
      name,
      position: count + 1,
      scoreType,
      // Times are the only score where a smaller number is better.
      higherIsBetter: scoreType !== "TIME",
      timeCapSeconds: optionalNumber(formData, "timeCapMinutes") !== null
        ? optionalNumber(formData, "timeCapMinutes")! * 60
        : null,
      repsPerRound: optionalNumber(formData, "repsPerRound"),
    },
  });
}


/**
 * Reads a score out of the form.
 *
 * The score entry screen gives the scorekeeper separate boxes — minutes and
 * seconds, or rounds and reps — because that is much quicker to type than
 * punctuation. They are joined back into the single text that score-format.ts
 * understands, so there is still only one place that knows how a score is read.
 */
function readScoreInput(
  formData: FormData,
  scoreType: string,
): { raw: string; status: ScoreStatus } {
  const chosen = text(formData, "status");
  const status: ScoreStatus =
    chosen === "CAPPED" ? "CAPPED" : chosen === "NO_SHOW" ? "NO_SHOW" : "FINISHED";

  // A no-show has no result at all, but still needs a row so it can be given
  // its penalty points.
  if (status === "NO_SHOW") return { raw: "0", status };

  // A capped result is recorded as the reps completed, whatever the event
  // normally measures.
  if (status === "CAPPED") {
    return { raw: text(formData, "reps") || text(formData, "value"), status };
  }

  if (scoreType === "TIME") {
    const minutes = text(formData, "minutes");
    const seconds = text(formData, "seconds");
    if (minutes !== "" || seconds !== "") {
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

export async function saveScore(formData: FormData) {
  const eventId = text(formData, "eventId");
  const competitionId = text(formData, "competitionId");
  const athleteId = text(formData, "athleteId") || null;
  const teamId = text(formData, "teamId") || null;

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("Event not found");

  const { raw, status } = readScoreInput(formData, event.scoreType);

  // An empty box means one of two different things. If the result is marked
  // finished, the scorekeeper has cleared it on purpose, so remove it. If it
  // is marked capped, the reps box has simply not been filled in yet, and
  // wiping the previous result would lose work.
  if (raw === "" && status !== "FINISHED") return;

  if (raw === "") {
    await db.score.deleteMany({
      where: { eventId, ...(athleteId ? { athleteId } : { teamId }) },
    });
    revalidatePath(`/competitions/${competitionId}/events/${eventId}`);
    return;
  }

  // A capped workout that was not finished is scored on reps completed, so
  // read the number as reps rather than as the event's normal score type.
  const parsed = parseScore(raw, {
    scoreType: status === "FINISHED" ? (event.scoreType as ScoreType) : "REPS",
    repsPerRound: event.repsPerRound,
  });
  if (!parsed.ok) throw new Error(parsed.error);

  const tiebreakRaw = text(formData, "tiebreak");
  let tiebreakSeconds: number | null = null;
  if (tiebreakRaw !== "") {
    const tiebreak = parseScore(tiebreakRaw, { scoreType: "TIME" });
    if (!tiebreak.ok) throw new Error(`Tiebreak: ${tiebreak.error}`);
    tiebreakSeconds = tiebreak.value;
  }

  const where = athleteId
    ? { eventId_athleteId: { eventId, athleteId } }
    : { eventId_teamId: { eventId, teamId: teamId! } };

  await db.score.upsert({
    where,
    create: {
      eventId,
      athleteId,
      teamId,
      value: parsed.value,
      tiebreakSeconds,
      status,
    },
    update: { value: parsed.value, tiebreakSeconds, status },
  });

  revalidatePath(`/competitions/${competitionId}/events/${eventId}`);
  revalidatePath(`/competitions/${competitionId}/leaderboard`);
}

/**
 * Draws a fresh set of teams for one event.
 *
 * SNAKE uses the leaderboard as it stands right now, so it pairs whoever is
 * currently leading with whoever is currently last. Running it again replaces
 * the previous draw for that event.
 */
export async function scrambleForEvent(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const eventId = text(formData, "eventId");

  const competition = await db.competition.findUnique({
    where: { id: competitionId },
    include: { athletes: true },
  });
  if (!competition) throw new Error("Competition not found");
  if (competition.mode !== "SCRAMBLE") throw new Error("This competition does not scramble");

  // The wizard chose the method, but the draw screen can override it for one
  // event without changing the competition's setting.
  const asked = text(formData, "method");
  const method: ScrambleMethod =
    asked === "RANDOM" || asked === "SNAKE" || asked === "HALVES"
      ? asked
      : competition.drawMethod === "RANDOM" || competition.drawMethod === "HALVES"
        ? competition.drawMethod
        : "SNAKE";

  const teamSize = competition.teamSize ?? 2;
  const { divisions } = await loadLeaderboard(competitionId);

  const positionOf = new Map<string, number>();
  for (const division of divisions) {
    for (const row of division.rows) positionOf.set(row.unitId, row.position);
  }
  // Athletes with no result yet go to the back of the queue.
  const worst = competition.athletes.length + 1;

  // Who has already been on a team together, from every earlier event.
  const past = await db.team.findMany({
    where: { competitionId, eventId: { not: null, notIn: [eventId] } },
    include: { members: true },
  });
  const previousPairs = new Set<string>();
  for (const team of past) {
    const ids = team.members.map((m) => m.athleteId);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) previousPairs.add(pairKey(ids[i], ids[j]));
    }
  }

  // Replace any previous draw for this event.
  await db.team.deleteMany({ where: { competitionId, eventId } });

  // Draw inside each division so teams are not mixed across categories.
  const byDivision = new Map<string | null, typeof competition.athletes>();
  for (const athlete of competition.athletes) {
    byDivision.set(athlete.divisionId, [
      ...(byDivision.get(athlete.divisionId) ?? []),
      athlete,
    ]);
  }

  for (const [divisionId, athletes] of byDivision) {
    const { teams } = drawTeams(
      athletes.map((athlete) => ({
        athleteId: athlete.id,
        position: positionOf.get(athlete.id) || worst,
        gender: athlete.gender,
        isSixtyPlus: athlete.isSixtyPlus,
      })),
      {
        method,
        teamSize,
        teammateRule: competition.teammateRule,
        drawGender: competition.drawGender,
        spreadSixtyPlus: competition.spreadSixtyPlus,
        previousPairs,
      },
    );

    for (const team of teams) {
      await db.team.create({
        data: {
          competitionId,
          divisionId,
          eventId,
          name: `Team ${team.index}`,
          members: { create: team.athleteIds.map((athleteId) => ({ athleteId })) },
        },
      });
    }
  }

  revalidatePath(`/competitions/${competitionId}/events/${eventId}`);
}

/**
 * Saves one result for a scramble team, and credits it to every member.
 *
 * In a scrambled competition the team does the workout together, so there is
 * one result — but the points belong to the individuals, because the teams are
 * about to be redrawn. Everyone on the team therefore gets the same score.
 */
export async function saveScrambleTeamScore(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const eventId = text(formData, "eventId");
  const teamId = text(formData, "teamId");

  const [event, team] = await Promise.all([
    db.event.findUnique({ where: { id: eventId } }),
    db.team.findUnique({ where: { id: teamId }, include: { members: true } }),
  ]);
  if (!event) throw new Error("Event not found");
  if (!team) throw new Error("Team not found");

  const athleteIds = team.members.map((member) => member.athleteId);
  const { raw, status } = readScoreInput(formData, event.scoreType);

  if (raw === "" && status !== "FINISHED") return;

  if (raw === "") {
    await db.score.deleteMany({ where: { eventId, athleteId: { in: athleteIds } } });
    revalidatePath(`/competitions/${competitionId}/events/${eventId}`);
    revalidatePath(`/competitions/${competitionId}/leaderboard`);
    return;
  }

  const parsed = parseScore(raw, {
    scoreType: status === "FINISHED" ? (event.scoreType as ScoreType) : "REPS",
    repsPerRound: event.repsPerRound,
  });
  if (!parsed.ok) throw new Error(parsed.error);

  const tiebreakRaw = text(formData, "tiebreak");
  let tiebreakSeconds: number | null = null;
  if (tiebreakRaw !== "") {
    const tiebreak = parseScore(tiebreakRaw, { scoreType: "TIME" });
    if (!tiebreak.ok) throw new Error(`Tiebreak: ${tiebreak.error}`);
    tiebreakSeconds = tiebreak.value;
  }

  for (const athleteId of athleteIds) {
    await db.score.upsert({
      where: { eventId_athleteId: { eventId, athleteId } },
      create: {
        eventId,
        athleteId,
        value: parsed.value,
        tiebreakSeconds,
        status,
      },
      update: { value: parsed.value, tiebreakSeconds, status },
    });
  }

  revalidatePath(`/competitions/${competitionId}/events/${eventId}`);
  revalidatePath(`/competitions/${competitionId}/leaderboard`);
}

// --- The setup wizard ----------------------------------------------------
//
// Each step saves on its way out, whether the organiser presses Continue or
// jumps to another step in the left-hand list. A competition is created as a
// draft the moment the wizard opens, so there is always somewhere to save to
// and a half-finished setup survives closing the laptop.

/** Where the form wants to go next. Defaults to the step after this one. */
function nextStep(formData: FormData, current: number): number {
  const asked = Number(text(formData, "goto"));
  const step = Number.isFinite(asked) ? asked : current + 1;
  return Math.max(0, Math.min(5, step));
}

export async function startCompetition() {
  const competition = await db.competition.create({
    data: {
      name: "",
      mode: "SCRAMBLE",
      teamSize: 2,
      divisions: { create: [{ name: "RX", position: 1 }, { name: "Scaled", position: 2 }] },
    },
  });
  redirect(`/competitions/${competition.id}/setup?step=0`);
}

export async function saveBasics(formData: FormData) {
  const id = text(formData, "competitionId");
  const date = text(formData, "date");

  await db.competition.update({
    where: { id },
    data: {
      name: text(formData, "name"),
      venue: text(formData, "venue") || null,
      // A date box gives back YYYY-MM-DD; noon avoids the day shifting when
      // the server and the organiser are in different time zones.
      date: date ? new Date(`${date}T12:00:00`) : null,
    },
  });

  redirect(`/competitions/${id}/setup?step=${nextStep(formData, 0)}`);
}

export async function saveScoringRules(formData: FormData) {
  const id = text(formData, "competitionId");

  await db.competition.update({
    where: { id },
    data: {
      pointsSystem: text(formData, "pointsSystem") === "PLACING" ? "PLACING" : "HUNDRED_STEPS",
      eventTieRule: ((): "SHARE_HIGHER" | "TIEBREAK_TIME" | "SHARE_AVERAGE" => {
        const chosen = text(formData, "eventTieRule");
        return chosen === "TIEBREAK_TIME" || chosen === "SHARE_AVERAGE"
          ? chosen
          : "SHARE_HIGHER";
      })(),
    },
  });

  redirect(`/competitions/${id}/setup?step=${nextStep(formData, 1)}`);
}

export async function saveFormat(formData: FormData) {
  const id = text(formData, "competitionId");

  const mode = ((): "INDIVIDUAL" | "SCRAMBLE" | "FIXED_TEAM" => {
    const chosen = text(formData, "mode");
    return chosen === "INDIVIDUAL" || chosen === "FIXED_TEAM" ? chosen : "SCRAMBLE";
  })();

  // The plus and minus buttons post how far to move rather than the result,
  // so the count cannot be knocked out of step by a stale page.
  const current = optionalNumber(formData, "teamSize") ?? 2;
  const delta = optionalNumber(formData, "teamSizeDelta") ?? 0;
  const teamSize = Math.max(2, Math.min(8, current + delta));

  await db.competition.update({
    where: { id },
    data: {
      mode,
      teamSize: mode === "INDIVIDUAL" ? null : teamSize,
      drawMethod: (["RANDOM", "SNAKE", "HALVES", "MANUAL"].includes(text(formData, "drawMethod"))
        ? text(formData, "drawMethod")
        : "SNAKE") as "RANDOM" | "SNAKE" | "HALVES" | "MANUAL",
      teammateRule: (["ALWAYS_DIFFERENT", "AVOID_REPEATS", "ALLOW_REPEATS"].includes(
        text(formData, "teammateRule"),
      )
        ? text(formData, "teammateRule")
        : "ALWAYS_DIFFERENT") as "ALWAYS_DIFFERENT" | "AVOID_REPEATS" | "ALLOW_REPEATS",
      drawGender: (["IGNORE", "MIXED", "SAME"].includes(text(formData, "drawGender"))
        ? text(formData, "drawGender")
        : "IGNORE") as "IGNORE" | "MIXED" | "SAME",
      spreadSixtyPlus: formData.get("spreadSixtyPlus") === "on",
      fixedTeamSource: (["SIGNUP", "DRAWN", "BALANCED"].includes(text(formData, "fixedTeamSource"))
        ? text(formData, "fixedTeamSource")
        : "SIGNUP") as "SIGNUP" | "DRAWN" | "BALANCED",
    },
  });

  // Nudging the team size keeps you on this step.
  if (delta !== 0) redirect(`/competitions/${id}/setup?step=2`);
  redirect(`/competitions/${id}/setup?step=${nextStep(formData, 2)}`);
}

export async function saveSharing(formData: FormData) {
  const id = text(formData, "competitionId");

  await db.competition.update({
    where: { id },
    data: {
      athleteAccess: formData.get("athleteAccess") === "on",
      publicLink: formData.get("publicLink") === "on",
    },
  });

  const goto = text(formData, "goto");
  if (goto !== "") redirect(`/competitions/${id}/setup?step=${nextStep(formData, 5)}`);
  redirect(`/competitions/${id}`);
}

/** Adds an athlete from inside the wizard and stays on the athletes step. */
export async function addAthleteInSetup(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const name = text(formData, "name");
  if (name !== "") {
    const gender = text(formData, "gender");
    await db.athlete.create({
      data: {
        competitionId,
        name,
        divisionId: text(formData, "divisionId") || null,
        gender: gender === "WOMAN" || gender === "MAN" || gender === "OTHER" ? gender : null,
        isSixtyPlus: formData.get("isSixtyPlus") === "on",
      },
    });
  }
  redirect(`/competitions/${competitionId}/setup?step=3`);
}

/** Adds an event from inside the wizard and stays on the events step. */
export async function addEventInSetup(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  await addEventRow(formData, competitionId);
  redirect(`/competitions/${competitionId}/setup?step=4`);
}
