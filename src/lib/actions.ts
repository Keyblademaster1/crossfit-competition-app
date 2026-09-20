"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { parseScore, type ScoreType } from "@/lib/score-format";
import { drawTeams, type ScrambleMethod } from "@/lib/scramble";
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

  revalidatePath(`/competitions/${competitionId}`);
}

export async function saveScore(formData: FormData) {
  const eventId = text(formData, "eventId");
  const competitionId = text(formData, "competitionId");
  const athleteId = text(formData, "athleteId") || null;
  const teamId = text(formData, "teamId") || null;

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("Event not found");

  const raw = text(formData, "value");
  const didNotFinish = formData.get("didNotFinish") === "on";

  // Clearing the box removes the score, which is how you undo a mistake.
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
    scoreType: didNotFinish ? "REPS" : event.scoreType,
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
      didNotFinish,
    },
    update: { value: parsed.value, tiebreakSeconds, didNotFinish },
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
  const method = (text(formData, "method") || "RANDOM") as ScrambleMethod;

  const competition = await db.competition.findUnique({
    where: { id: competitionId },
    include: { athletes: true },
  });
  if (!competition) throw new Error("Competition not found");
  if (competition.mode !== "SCRAMBLE") throw new Error("This competition uses fixed teams");

  const teamSize = competition.teamSize ?? 2;
  const { divisions } = await loadLeaderboard(competitionId);

  const positionOf = new Map<string, number>();
  for (const division of divisions) {
    for (const row of division.rows) positionOf.set(row.unitId, row.position);
  }

  // Athletes with no result yet go to the back of the queue.
  const worst = competition.athletes.length + 1;

  // Replace any previous draw for this event.
  await db.team.deleteMany({ where: { competitionId, eventId } });

  // Draw inside each division so teams are not mixed across categories.
  const byDivision = new Map<string | null, typeof competition.athletes>();
  for (const athlete of competition.athletes) {
    const key = athlete.divisionId;
    byDivision.set(key, [...(byDivision.get(key) ?? []), athlete]);
  }

  for (const [divisionId, athletes] of byDivision) {
    const drawn = drawTeams(
      athletes.map((athlete) => ({
        athleteId: athlete.id,
        position: positionOf.get(athlete.id) || worst,
      })),
      { method, teamSize },
    );

    for (const team of drawn) {
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
  const raw = text(formData, "value");
  const didNotFinish = formData.get("didNotFinish") === "on";

  if (raw === "") {
    await db.score.deleteMany({ where: { eventId, athleteId: { in: athleteIds } } });
    revalidatePath(`/competitions/${competitionId}/events/${eventId}`);
    revalidatePath(`/competitions/${competitionId}/leaderboard`);
    return;
  }

  const parsed = parseScore(raw, {
    scoreType: didNotFinish ? "REPS" : event.scoreType,
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
        didNotFinish,
      },
      update: { value: parsed.value, tiebreakSeconds, didNotFinish },
    });
  }

  revalidatePath(`/competitions/${competitionId}/events/${eventId}`);
  revalidatePath(`/competitions/${competitionId}/leaderboard`);
}
