"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { IMPLEMENTS, type ImplementId } from "@/components/implement";
import { parseScore, type ScoreType } from "@/lib/score-format";
import {
  text,
  optionalNumber,
  nextStep,
  readScoreInput,
  clearsScore,
} from "@/lib/form-input";
import { drawTeams, pairKey, type ScrambleMethod } from "@/lib/scramble";
import {
  totalRepsReached,
  repSequence,
  scoringFor,
  versionOf,
  FORMATS,
  FORMAT_ORDER,
  SPLITS,
  type BlockFormat,
  type BlockPlan,
  type WorkSplit,
} from "@/lib/workout";
import { loadLeaderboard } from "@/lib/leaderboard";
import { heatsByGroup } from "@/lib/heats";
import { teamClass, TEAM_CLASSES } from "@/lib/team-class";
import { parseAthleteList, withoutDuplicates } from "@/lib/athlete-list";

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

  // Gender and 60+ decide what everybody lifts and how the draw pairs them,
  // so an athlete added here has to be able to carry them too. Without this
  // a latecomer got neither, and was quietly treated as a man on a 20 kg bar.
  const gender = text(formData, "gender");
  // Sex decides a fixed team's class and what everyone lifts, so nobody is
  // added without it. The form asks for it too; this is the backstop.
  if (gender !== "WOMAN" && gender !== "MAN") return;
  await db.athlete.create({
    data: {
      competitionId,
      name,
      divisionId,
      gender,
      isSixtyPlus: formData.get("isSixtyPlus") === "on",
    },
  });
  revalidatePath(`/competitions/${competitionId}`);
}

/**
 * Removes an athlete. The id is bound to the action rather than posted as a
 * field, because a submit button's `name` is already used by React to say
 * which action is being called, and the two cannot share it.
 */
export async function deleteAthlete(athleteId: string, formData: FormData) {
  const competitionId = text(formData, "competitionId");
  await db.athlete.delete({ where: { id: athleteId } });
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
  if (name === "") return null;

  const [count, competition] = await Promise.all([
    db.event.count({ where: { competitionId } }),
    db.competition.findUnique({
      where: { id: competitionId },
      include: { divisions: { orderBy: { position: "asc" } } },
    }),
  ]);
  // Fixed teams: the first division's version is built first. The others
  // start empty, so they can be copied from it once it is written out.
  const versions =
    competition?.mode === "FIXED_TEAM" && competition.divisions.length > 0
      ? [competition.divisions[0].id]
      : [null];
  const capMinutes = optionalNumber(formData, "timeCapMinutes");

  // Every event starts as one "for time" block, ready for its movements. It is
  // scored time-if-finished, reps-if-capped until its blocks say otherwise.
  const event = await db.event.create({
    data: {
      competitionId,
      name,
      position: count + 1,
      scoreType: "TIME_OR_REPS",
      higherIsBetter: false,
      timeCapSeconds: capMinutes !== null ? capMinutes * 60 : null,
      blocks: {
        create: versions.map((divisionId) => ({
          divisionId,
          position: 1,
          format: "FOR_TIME" as const,
          split: competition?.mode === "INDIVIDUAL" ? null : ("ANYHOW" as const),
        })),
      },
    },
    include: { blocks: { orderBy: { divisionId: "asc" } } },
  });
  const firstBlock = event.blocks.find((block) => block.divisionId === versions[0]) ?? event.blocks[0];
  await db.event.update({ where: { id: event.id }, data: { tiebreakBlockId: firstBlock.id } });
  return event;
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
  // Not filled in yet: leave whatever is stored alone.
  if (raw === "" && !clearsScore({ raw, status })) return;

  if (clearsScore({ raw, status })) {
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

  // A capped result is entered as how far they got — "36 into the burpees" —
  // and the finished movements are added on here, rather than by the
  // scorekeeper between heats.
  let value = parsed.value;
  const movementId = text(formData, "movementId");
  if (status === "CAPPED" && movementId !== "") {
    const version = await versionFor(eventId, teamId, athleteId);
    value = totalRepsReached(await loadRepSequence(eventId, version), movementId, parsed.value);
  }

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
      value,
      tiebreakSeconds,
      status,
    },
    update: { value, tiebreakSeconds, status },
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

  // The draw screen can change the method and the teammate rule while
  // standing at the whiteboard. Those choices stick, because an organiser who
  // changes their mind mid-competition means it from then on.
  const askedRule = text(formData, "teammateRule");
  if (["ALWAYS_DIFFERENT", "AVOID_REPEATS", "ALLOW_REPEATS"].includes(askedRule)) {
    await db.competition.update({
      where: { id: competitionId },
      data: { teammateRule: askedRule as "ALWAYS_DIFFERENT" | "AVOID_REPEATS" | "ALLOW_REPEATS" },
    });
    competition.teammateRule = askedRule as typeof competition.teammateRule;
  }

  const asked = text(formData, "method");
  const method: ScrambleMethod =
    asked === "RANDOM" || asked === "SNAKE" || asked === "HALVES"
      ? asked
      : competition.drawMethod === "RANDOM" || competition.drawMethod === "HALVES"
        ? competition.drawMethod
        : competition.drawMethod === null
          ? "RANDOM" // never chosen, so plain chance rather than a guess
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
        teammateRule: competition.teammateRule ?? undefined,
        drawGender: competition.drawGender ?? undefined,
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
  revalidatePath(`/competitions/${competitionId}/events/${eventId}/draw`);
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

  // Not filled in yet: leave whatever is stored alone.
  if (raw === "" && !clearsScore({ raw, status })) return;

  if (clearsScore({ raw, status })) {
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

  // A capped result is entered as how far they got — "36 into the burpees" —
  // and the finished movements are added on here, rather than by the
  // scorekeeper between heats.
  let value = parsed.value;
  const movementId = text(formData, "movementId");
  if (status === "CAPPED" && movementId !== "") {
    // Scrambled teams: one version of the workout.
    value = totalRepsReached(await loadRepSequence(eventId, null), movementId, parsed.value);
  }

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
        value,
        tiebreakSeconds,
        status,
      },
      update: { value, tiebreakSeconds, status },
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

export async function startCompetition() {
  const competition = await db.competition.create({
    data: {
      name: "",
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

  // Left empty until a card is picked; nothing is chosen for the organiser.
  const mode = ((): "INDIVIDUAL" | "SCRAMBLE" | "FIXED_TEAM" | null => {
    const chosen = text(formData, "mode");
    return chosen === "INDIVIDUAL" || chosen === "SCRAMBLE" || chosen === "FIXED_TEAM"
      ? chosen
      : null;
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
        : null) as "RANDOM" | "SNAKE" | "HALVES" | "MANUAL" | null,
      teammateRule: (["ALWAYS_DIFFERENT", "AVOID_REPEATS", "ALLOW_REPEATS"].includes(
        text(formData, "teammateRule"),
      )
        ? text(formData, "teammateRule")
        : null) as "ALWAYS_DIFFERENT" | "AVOID_REPEATS" | "ALLOW_REPEATS" | null,
      drawGender: (["IGNORE", "MIXED", "SAME"].includes(text(formData, "drawGender"))
        ? text(formData, "drawGender")
        : null) as "IGNORE" | "MIXED" | "SAME" | null,
      spreadSixtyPlus: formData.get("spreadSixtyPlus") === "on",
      fixedTeamSource: (["SIGNUP", "DRAWN", "BALANCED"].includes(text(formData, "fixedTeamSource"))
        ? text(formData, "fixedTeamSource")
        : null) as "SIGNUP" | "DRAWN" | "BALANCED" | null,
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

/**
 * Adds an athlete from inside the wizard.
 *
 * The Add button carries no destination, so it stays on this step ready for
 * the next name. Continue and the steps in the left-hand list do carry one,
 * and go there — adding whatever was typed first, so a name entered and then
 * left behind is not silently thrown away.
 */
export async function addAthleteInSetup(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  await saveAthleteEdits(formData, competitionId);
  // Who could not be added because their sex was not given, to say so on the
  // page that comes back rather than drop them without a word.
  const needSex: string[] = [];
  let keepName = "";
  let keepList = "";

  const name = text(formData, "name");
  const sex = text(formData, "gender");
  if (name !== "" && sex !== "WOMAN" && sex !== "MAN") {
    needSex.push(name);
    keepName = name;
  } else if (name !== "" && !(await athleteNamed(competitionId, name))) {
    await db.athlete.create({
      data: {
        competitionId,
        name,
        divisionId: text(formData, "divisionId") || null,
        gender: sex as "WOMAN" | "MAN",
        isSixtyPlus: formData.get("isSixtyPlus") === "on",
      },
    });
  }

  // A pasted list is saved by any button on the step, Continue included, so
  // nothing typed into the box is lost by moving on.
  let pasteNote = "";
  const list = text(formData, "list");
  if (list !== "") {
    const [divisions, existing] = await Promise.all([
      db.division.findMany({ where: { competitionId } }),
      db.athlete.findMany({ where: { competitionId }, select: { name: true } }),
    ]);
    const { toAdd: parsed, skipped } = withoutDuplicates(
      parseAthleteList(list, divisions.map((d) => d.name)),
      existing.map((a) => a.name),
    );
    // A line with no W or M is left out, and put back in the box to finish.
    const toAdd = parsed.filter((athlete) => athlete.gender !== null);
    const noSex = parsed.filter((athlete) => athlete.gender === null);
    needSex.push(...noSex.map((athlete) => athlete.name));
    keepList = noSex
      .map((athlete) =>
        [athlete.name, athlete.isSixtyPlus ? "60+" : "", athlete.division ?? ""]
          .filter(Boolean)
          .join(", "),
      )
      .join("\n");
    await db.athlete.createMany({
      data: toAdd.map((athlete) => ({
        competitionId,
        name: athlete.name,
        gender: athlete.gender,
        isSixtyPlus: athlete.isSixtyPlus,
        divisionId: divisions.find((d) => d.name === athlete.division)?.id ?? null,
      })),
    });
    pasteNote = `&added=${toAdd.length}&skipped=${skipped}`;
  }

  needSex.push(...(await saveTeamRoster(formData, competitionId)));
  await rememberForSetup(competitionId, { needSex, keepName, keepList });

  const goto = text(formData, "goto");
  redirect(
    goto === ""
      ? `/competitions/${competitionId}/setup?step=3${pasteNote}`
      : `/competitions/${competitionId}/setup?step=${nextStep(formData, 3)}`,
  );
}

/**
 * A note for the athletes step to show once it comes back: who was not added
 * for want of their sex, with what was typed kept so it can be finished. A
 * short-lived cookie, since a server action's redirect cannot carry it and
 * names do not belong in the address bar.
 */
export type SetupNote = { needSex: string[]; keepName: string; keepList: string };

async function rememberForSetup(competitionId: string, note: SetupNote) {
  const jar = await cookies();
  const path = `/competitions/${competitionId}/setup`;
  if (note.needSex.length === 0) {
    jar.delete({ name: "setup-note", path });
    return;
  }
  jar.set("setup-note", JSON.stringify(note), { path, maxAge: 60, sameSite: "lax" });
}

/**
 * Corrections made by clicking an athlete's name on the athletes step.
 *
 * Every athlete on the step posts their details, opened or not, so only the
 * ones that differ from what is saved are written. A new name already taken by
 * someone else is left as it was, since two athletes cannot share one.
 */
async function saveAthleteEdits(formData: FormData, competitionId: string) {
  const athletes = await db.athlete.findMany({ where: { competitionId } });
  const byId = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  const taken = new Set(athletes.map((athlete) => athlete.name.toLowerCase()));

  for (const key of formData.keys()) {
    if (!key.startsWith("edit:")) continue;
    const id = key.slice("edit:".length);
    const athlete = byId.get(id);
    if (!athlete) continue;

    // Sex can be corrected but not cleared: "Choose…", shown to anyone who
    // has none yet, leaves them as they are.
    const askedGender = text(formData, `editGender:${id}`);
    const gender =
      askedGender === "WOMAN" || askedGender === "MAN" ? askedGender : athlete.gender;
    const isSixtyPlus = formData.get(`editSixtyPlus:${id}`) === "on";
    let name = text(formData, `editName:${id}`).replace(/\s+/g, " ") || athlete.name;
    if (name.toLowerCase() !== athlete.name.toLowerCase() && taken.has(name.toLowerCase())) {
      name = athlete.name;
    }

    if (name === athlete.name && gender === athlete.gender && isSixtyPlus === athlete.isSixtyPlus) {
      continue;
    }
    await db.athlete.update({ where: { id }, data: { name, gender, isSixtyPlus } });
    taken.delete(athlete.name.toLowerCase());
    taken.add(name.toLowerCase());
  }
}

/**
 * Finds an athlete by name, ignoring capitals and extra spaces. Two athletes
 * cannot share a name in one competition, and adding the same one twice used
 * to crash the page instead of simply doing nothing.
 */
async function athleteNamed(competitionId: string, name: string) {
  const wanted = name.toLowerCase().replace(/\s+/g, " ").trim();
  const athletes = await db.athlete.findMany({
    where: { competitionId },
    select: { id: true, name: true },
  });
  return athletes.find((a) => a.name.toLowerCase().replace(/\s+/g, " ").trim() === wanted) ?? null;
}

/** Takes an athlete off every fixed team, ready to go on another or none. */
async function leaveFixedTeams(athleteId: string) {
  await db.teamMember.deleteMany({ where: { athleteId, team: { eventId: null } } });
}

/**
 * The roster on the athletes step, for fixed teams chosen at signup.
 *
 * Its fields are named after the team or athlete they belong to, because the
 * whole step is one form and several cards each have their own boxes:
 * `member:<teamId>` is a new name typed into a team's card, and
 * `assign:<athleteId>` is the team picked for someone not on one yet.
 */
async function saveTeamRoster(formData: FormData, competitionId: string): Promise<string[]> {
  const needSex: string[] = [];
  const teamName = text(formData, "newTeamName");
  if (teamName !== "") {
    const exists = await db.team.findFirst({
      where: { competitionId, eventId: null, name: { equals: teamName, mode: "insensitive" } },
    });
    if (!exists) {
      await db.team.create({
        data: {
          competitionId,
          name: teamName,
          divisionId: text(formData, "newTeamDivisionId") || null,
          eventId: null,
        },
      });
    }
  }

  const teams = await db.team.findMany({ where: { competitionId, eventId: null } });
  const teamById = new Map(teams.map((team) => [team.id, team]));

  for (const [key, value] of formData) {
    const [kind, id] = key.split(":");
    const field = String(value).trim();
    if (field === "") continue;

    if (kind === "member" && teamById.has(id)) {
      const team = teamById.get(id)!;
      const gender = text(formData, `memberGender:${id}`);
      // A name already signed up but not on a team goes onto this one;
      // someone already on a team is left where they are.
      const existing = await athleteNamed(competitionId, field);
      if (existing) {
        const onATeam = await db.teamMember.count({
          where: { athleteId: existing.id, team: { eventId: null } },
        });
        if (onATeam === 0) {
          await db.teamMember.create({ data: { teamId: id, athleteId: existing.id } });
        }
        continue;
      }
      if (gender !== "WOMAN" && gender !== "MAN") {
        needSex.push(field);
        continue;
      }
      await db.athlete.create({
        data: {
          competitionId,
          name: field,
          gender,
          isSixtyPlus: formData.get(`memberSixtyPlus:${id}`) === "on",
          divisionId: team.divisionId,
          memberships: { create: { teamId: id } },
        },
      });
    }

    if (kind === "assign" && teamById.has(field)) {
      const athlete = await db.athlete.findFirst({ where: { id, competitionId } });
      if (!athlete) continue;
      await leaveFixedTeams(id);
      await db.teamMember.create({ data: { teamId: field, athleteId: id } });
      // Everyone on a team is in that team's division.
      await db.athlete.update({
        where: { id },
        data: { divisionId: teamById.get(field)!.divisionId },
      });
    }
  }
  return needSex;
}

/** Takes an athlete off their team, back to "Not on a team yet". */
export async function takeOffTeam(athleteId: string, formData: FormData) {
  const competitionId = text(formData, "competitionId");
  await leaveFixedTeams(athleteId);
  revalidatePath(`/competitions/${competitionId}/setup`);
}

/** Removes a fixed team. Its athletes stay, back on "Not on a team yet". */
export async function deleteTeam(teamId: string, formData: FormData) {
  const competitionId = text(formData, "competitionId");
  await db.team.delete({ where: { id: teamId } });
  revalidatePath(`/competitions/${competitionId}`);
  revalidatePath(`/competitions/${competitionId}/setup`);
}

/** Adds an event from inside the wizard. Same rule as adding an athlete. */
export async function addEventInSetup(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const created = await addEventRow(formData, competitionId);
  const goto = text(formData, "goto");
  // "Add event" goes straight on to writing out the workout, which is what the
  // loads, the equipment for each heat and capped scores are worked out from.
  if (created && goto === "") {
    redirect(`/competitions/${competitionId}/events?event=${created.id}&from=setup`);
  }
  redirect(
    `/competitions/${competitionId}/setup?step=${goto === "" ? 4 : nextStep(formData, 4)}`,
  );
}

// --- The event builder ---------------------------------------------------

/** What the load is on. Only a barbell gets made up from plates. */
function readImplement(formData: FormData): ImplementId {
  const chosen = text(formData, "implement");
  return IMPLEMENTS.some((option) => option.id === chosen)
    ? (chosen as ImplementId)
    : "OTHER";
}

/**
 * The event's name, time cap and tiebreak block. They sit in different parts
 * of the builder, each saving itself, so only the fields a form actually
 * posts are changed.
 */
export async function updateEvent(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const eventId = text(formData, "eventId");
  const data: { name?: string; timeCapSeconds?: number | null; tiebreakBlockId?: string | null } = {};

  if (formData.has("name") && text(formData, "name") !== "") data.name = text(formData, "name");
  if (formData.has("timeCap")) data.timeCapSeconds = readTimeCap(text(formData, "timeCap"));
  if (formData.has("tiebreakBlockId")) data.tiebreakBlockId = text(formData, "tiebreakBlockId") || null;

  await db.event.update({ where: { id: eventId }, data });
  revalidatePath(`/competitions/${competitionId}/events`);
}

/** "12:00" or plain "12" minutes, as seconds. Empty means no cap. */
function readTimeCap(raw: string): number | null {
  if (raw === "") return null;
  const parsed = parseScore(raw.includes(":") ? raw : `${raw}:00`, { scoreType: "TIME" });
  return parsed.ok && parsed.value > 0 ? parsed.value : null;
}

/**
 * "+ Add event" in the builder: a new event named after its place in the
 * order, opened straight away with its name ready to change.
 */
export async function addEventFromBuilder(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const created = await addEventRow(formData, competitionId);
  revalidatePath(`/competitions/${competitionId}`);
  if (created) {
    const fromSetup = text(formData, "from") === "setup" ? "&from=setup" : "";
    redirect(`/competitions/${competitionId}/events?event=${created.id}${fromSetup}`);
  }
}

/**
 * Brings an event up to date after its blocks change: numbers the movements
 * through the whole workout, block by block, and works out how it is scored.
 *
 * Nobody picks a score type any more (see `scoringFor` in workout.ts), but
 * score entry and the leaderboard still read one, so it is kept on the event
 * and refreshed here, along with the round size for a lone AMRAP.
 */
async function refreshEventPlan(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      blocks: {
        orderBy: { position: "asc" },
        include: { movements: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!event) return;
  const first = await firstDivisionOf(event.competitionId);

  // One division's version after another, so each reads in order on its own.
  const versions = new Map<string | null, typeof event.blocks>();
  for (const block of event.blocks) {
    const key = block.divisionId ?? first;
    versions.set(key, [...(versions.get(key) ?? []), block]);
  }
  let position = 1;
  for (const blocks of versions.values()) {
    for (const block of blocks) {
      for (const movement of block.movements) {
        if (movement.position !== position) {
          await db.movement.update({ where: { id: movement.id }, data: { position } });
        }
        position++;
      }
    }
  }

  // Fixed teams give each division its own blocks; the first division's
  // version decides how the event is scored, since one event is ranked one way.
  const scoring = scoringFor(versionOf(event.blocks, null, first).map(planOf));
  if (
    scoring.scoreType !== event.scoreType ||
    scoring.higherIsBetter !== event.higherIsBetter ||
    scoring.repsPerRound !== event.repsPerRound
  ) {
    await db.event.update({ where: { id: eventId }, data: scoring });
  }
}

/** A stored block, in the shape the rules in workout.ts work with. */
function planOf(block: {
  id: string;
  format: BlockFormat;
  setting: string | null;
  split: WorkSplit | null;
  movements: { id: string; name: string; reps: number }[];
}): BlockPlan {
  return {
    id: block.id,
    format: block.format,
    setting: block.setting,
    split: block.split,
    movements: block.movements.map(({ id, name, reps }) => ({ id, name, reps })),
  };
}

/** The division whose version is "the" workout: the first one listed. */
async function firstDivisionOf(competitionId: string) {
  const division = await db.division.findFirst({
    where: { competitionId },
    orderBy: { position: "asc" },
  });
  return division?.id ?? null;
}

/**
 * Every rep of an event in order, for entering a capped result as "36 into
 * burpees, round 3", in the version the team did: a Scaled team is counted
 * through the Scaled workout. Only fixed teams have versions; pass null
 * everywhere else.
 */
async function loadRepSequence(eventId: string, divisionId: string | null) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      blocks: {
        orderBy: { position: "asc" },
        include: { movements: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!event) return [];
  const first = await firstDivisionOf(event.competitionId);
  return repSequence(versionOf(event.blocks, divisionId, first).map(planOf));
}

/** Which division's version a result was done in; null outside fixed teams. */
async function versionFor(eventId: string, teamId: string | null, athleteId: string | null) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { competition: true },
  });
  if (event?.competition.mode !== "FIXED_TEAM") return null;
  if (teamId) return (await db.team.findUnique({ where: { id: teamId } }))?.divisionId ?? null;
  if (athleteId) return (await db.athlete.findUnique({ where: { id: athleteId } }))?.divisionId ?? null;
  return null;
}

/**
 * The blocks of one division's version, found the same way the builder shows
 * them, so moving and renumbering never mixes RX with Scaled.
 */
async function versionBlocks(eventId: string, divisionId: string | null) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { blocks: { orderBy: { position: "asc" } } },
  });
  if (!event) return [];
  return versionOf(event.blocks, divisionId, await firstDivisionOf(event.competitionId));
}

const BLOCK_FORMATS = FORMAT_ORDER as readonly string[];
const WORK_SPLITS = SPLITS.map((option) => option.id) as readonly string[];

/**
 * Adds a block to the end of an event, in the format picked from "Add block":
 * to one division's version in fixed teams, to the one version elsewhere.
 */
export async function addBlock(
  eventId: string,
  divisionId: string | null,
  format: BlockFormat,
  formData: FormData,
) {
  const competitionId = text(formData, "competitionId");
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { competition: true },
  });
  if (!event || !BLOCK_FORMATS.includes(format)) return;
  const version = await versionBlocks(eventId, divisionId);

  await db.block.create({
    data: {
      eventId,
      divisionId,
      position: version.length + 1,
      format,
      setting: FORMATS[format].defaultSetting,
      split: event.competition.mode === "INDIVIDUAL" ? null : "ANYHOW",
    },
  });
  await refreshEventPlan(eventId);
  revalidatePath(`/competitions/${competitionId}/events`);
}

/** A block's format, its setting and how the team splits the work. */
export async function updateBlock(blockId: string, formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const block = await db.block.findUnique({ where: { id: blockId } });
  if (!block) return;

  const asked = text(formData, "format");
  const format = BLOCK_FORMATS.includes(asked) ? (asked as BlockFormat) : block.format;
  const split = text(formData, "split");
  // A new format starts from its own example setting; "12" minutes of AMRAP
  // means nothing as a ladder's rep scheme.
  const setting =
    format !== block.format ? FORMATS[format].defaultSetting : text(formData, "setting") || null;

  await db.block.update({
    where: { id: blockId },
    data: {
      format,
      setting,
      split: WORK_SPLITS.includes(split) ? (split as WorkSplit) : block.split,
    },
  });
  await refreshEventPlan(block.eventId);
  revalidatePath(`/competitions/${competitionId}/events`);
}

export async function deleteBlock(blockId: string, formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const block = await db.block.delete({ where: { id: blockId } });

  const rest = await versionBlocks(block.eventId, block.divisionId);
  for (const [index, row] of rest.entries()) {
    if (row.position !== index + 1) {
      await db.block.update({ where: { id: row.id }, data: { position: index + 1 } });
    }
  }
  await refreshEventPlan(block.eventId);
  revalidatePath(`/competitions/${competitionId}/events`);
}

/** Moves a block up or down the workout, taking its movements with it. */
export async function moveBlock(blockId: string, by: number, formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const block = await db.block.findUnique({ where: { id: blockId } });
  if (!block) return;

  const neighbours = await versionBlocks(block.eventId, block.divisionId);
  const index = neighbours.findIndex((b) => b.id === blockId);
  const target = index + by;
  if (target < 0 || target >= neighbours.length) return;

  await db.block.update({ where: { id: neighbours[index].id }, data: { position: neighbours[target].position } });
  await db.block.update({ where: { id: neighbours[target].id }, data: { position: neighbours[index].position } });
  await refreshEventPlan(block.eventId);
  revalidatePath(`/competitions/${competitionId}/events`);
}

/**
 * Starts one division's version as a copy of another's, usually Scaled from
 * RX: the same blocks and movements, to change what differs. Only offered
 * while the division has no blocks of its own, so nothing is overwritten.
 */
export async function copyVersion(
  eventId: string,
  fromDivisionId: string,
  toDivisionId: string,
  formData: FormData,
) {
  const competitionId = text(formData, "competitionId");
  if ((await versionBlocks(eventId, toDivisionId)).length > 0) return;

  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      blocks: { orderBy: { position: "asc" }, include: { movements: { orderBy: { position: "asc" } } } },
    },
  });
  if (!event) return;
  const source = versionOf(event.blocks, fromDivisionId, await firstDivisionOf(event.competitionId));

  for (const block of source) {
    await db.block.create({
      data: {
        eventId,
        divisionId: toDivisionId,
        position: block.position,
        format: block.format,
        setting: block.setting,
        split: block.split,
        movements: {
          create: block.movements.map((movement) => ({
            eventId,
            position: 100000 + movement.position,
            reps: movement.reps,
            name: movement.name,
            loadMode: movement.loadMode,
            implement: movement.implement,
            loadMenMen: movement.loadMenMen,
            loadWomenWomen: movement.loadWomenWomen,
            loadMixed: movement.loadMixed,
            loadSixtyPlus: movement.loadSixtyPlus,
          })),
        },
      },
    });
  }
  await refreshEventPlan(eventId);
  revalidatePath(`/competitions/${competitionId}/events`);
}

/** The loads a movement row posts, the same four boxes for either load mode. */
function readLoads(formData: FormData) {
  return {
    loadMode: formData.get("shared") === "on" ? ("SHARED" as const) : ("EACH" as const),
    implement: readImplement(formData),
    loadMenMen: text(formData, "loadMenMen") || null,
    loadWomenWomen: text(formData, "loadWomenWomen") || null,
    loadMixed: text(formData, "loadMixed") || null,
    loadSixtyPlus: text(formData, "loadSixtyPlus") || null,
  };
}

export async function addMovement(blockId: string, formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const name = text(formData, "name");
  const block = await db.block.findUnique({ where: { id: blockId } });
  if (!block || name === "") return;

  await db.movement.create({
    data: {
      eventId: block.eventId,
      blockId,
      // After everything; refreshEventPlan numbers it properly.
      position: 100000,
      name,
      reps: optionalNumber(formData, "reps") ?? 1,
      ...readLoads(formData),
    },
  });
  await refreshEventPlan(block.eventId);

  revalidatePath(`/competitions/${competitionId}/events`);
}

export async function updateMovement(movementId: string, formData: FormData) {
  const competitionId = text(formData, "competitionId");

  const movement = await db.movement.update({
    where: { id: movementId },
    data: {
      name: text(formData, "name") || undefined,
      reps: optionalNumber(formData, "reps") ?? undefined,
      ...readLoads(formData),
    },
  });
  await refreshEventPlan(movement.eventId);

  revalidatePath(`/competitions/${competitionId}/events`);
}

export async function deleteMovement(movementId: string, formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const movement = await db.movement.delete({ where: { id: movementId } });
  await refreshEventPlan(movement.eventId);

  revalidatePath(`/competitions/${competitionId}/events`);
}

/** Moves a movement up or down within its block. */
export async function moveMovement(movementId: string, by: number, formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const movement = await db.movement.findUnique({ where: { id: movementId } });
  if (!movement) return;

  const neighbours = await db.movement.findMany({
    where: { blockId: movement.blockId },
    orderBy: { position: "asc" },
  });
  const index = neighbours.findIndex((m) => m.id === movementId);
  const target = index + by;
  if (target < 0 || target >= neighbours.length) return;

  await db.movement.update({ where: { id: neighbours[index].id }, data: { position: neighbours[target].position } });
  await db.movement.update({ where: { id: neighbours[target].id }, data: { position: neighbours[index].position } });
  await refreshEventPlan(movement.eventId);

  revalidatePath(`/competitions/${competitionId}/events`);
}

export async function deleteEvent(eventId: string, formData: FormData) {
  const competitionId = text(formData, "competitionId");
  await db.event.delete({ where: { id: eventId } });
  revalidatePath(`/competitions/${competitionId}/events`);
}

// --- Heats and lanes -----------------------------------------------------

/**
 * Splits whoever is taking part into heats, because the floor has only so
 * many lanes.
 *
 * Two orders, both of which people care about. By standing puts the leaders
 * in the last heat, so the competition finishes on the best pairing and
 * everyone can watch. Random makes no promises, which suits a scramble where
 * the teams have only just been drawn.
 */
export async function generateHeats(formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const eventId = text(formData, "eventId");
  const byStanding = text(formData, "order") !== "RANDOM";

  const competition = await db.competition.findUnique({ where: { id: competitionId } });
  if (!competition) throw new Error("Competition not found");

  const lanesPerHeat = Math.max(1, optionalNumber(formData, "lanesPerHeat") ?? competition.lanesPerHeat);
  if (lanesPerHeat !== competition.lanesPerHeat) {
    await db.competition.update({ where: { id: competitionId }, data: { lanesPerHeat } });
  }

  // Who is on the floor: the teams drawn for this event, the fixed teams, or
  // the athletes themselves.
  const scrambleTeams = await db.team.findMany({
    where: { competitionId, eventId },
    include: { members: true },
  });
  const fixedTeams =
    competition.mode === "FIXED_TEAM"
      ? await db.team.findMany({
          where: { competitionId, eventId: null },
          include: { members: { include: { athlete: { select: { gender: true } } } } },
        })
      : [];
  // Fixed teams race their own division and class only. Scaled runs before
  // RX, so the event finishes on the first division, and within each:
  // W/W, M/M, Mixed, then any team whose class is not known yet.
  const divisionOrder = (
    await db.division.findMany({ where: { competitionId }, orderBy: { position: "desc" } })
  ).map((division) => division.id);
  const athletes =
    competition.mode === "INDIVIDUAL"
      ? await db.athlete.findMany({ where: { competitionId } })
      : [];

  const { divisions } = await loadLeaderboard(competitionId);
  const positionOf = new Map<string, number>();
  for (const division of divisions) {
    for (const row of division.rows) positionOf.set(row.unitId, row.position);
  }

  // Rank each entry so the running order can be worked out. A scramble team
  // is ranked by its best member, since that is who the crowd came to watch.
  type Entry = { teamId?: string; athleteId?: string; rank: number; group: string };
  let entries: Entry[];
  if (scrambleTeams.length > 0) {
    entries = scrambleTeams.map((team) => ({
      teamId: team.id,
      group: "all",
      rank: Math.min(
        ...team.members.map((m) => positionOf.get(m.athleteId) ?? Number.MAX_SAFE_INTEGER),
      ),
    }));
  } else if (fixedTeams.length > 0) {
    entries = fixedTeams.map((team) => {
      const cls = teamClass(team.members.map((m) => m.athlete.gender));
      const division = divisionOrder.indexOf(team.divisionId ?? "");
      const clsOrder = cls ? TEAM_CLASSES.findIndex((option) => option.id === cls) : TEAM_CLASSES.length;
      return {
        teamId: team.id,
        rank: positionOf.get(team.id) ?? Number.MAX_SAFE_INTEGER,
        // Sorts as it reads: division first, then class.
        group: `${String(division === -1 ? 99 : division).padStart(2, "0")}:${clsOrder}`,
      };
    });
  } else {
    entries = athletes.map((athlete) => ({
      athleteId: athlete.id,
      group: "all",
      rank: positionOf.get(athlete.id) ?? Number.MAX_SAFE_INTEGER,
    }));
  }

  if (byStanding) {
    // Worst first, so the leaders are last on the floor.
    entries.sort((a, b) => b.rank - a.rank);
  } else {
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
  }

  await db.heat.deleteMany({ where: { eventId } });

  // Fixed teams: groups kept apart and evened out. Everyone else: straight
  // runs of full heats, as before.
  let heats: Entry[][];
  if (fixedTeams.length > 0 && scrambleTeams.length === 0) {
    entries.sort((a, b) => a.group.localeCompare(b.group)); // stable: keeps the order within each
    heats = heatsByGroup(entries, lanesPerHeat);
  } else {
    heats = [];
    for (let start = 0; start < entries.length; start += lanesPerHeat) {
      heats.push(entries.slice(start, start + lanesPerHeat));
    }
  }

  for (const [index, group] of heats.entries()) {
    await db.heat.create({
      data: {
        eventId,
        number: index + 1,
        lanes: {
          create: group.map((entry, index) => ({
            number: index + 1,
            teamId: entry.teamId ?? null,
            athleteId: entry.athleteId ?? null,
          })),
        },
      },
    });
  }

  revalidatePath(`/competitions/${competitionId}/events/${eventId}/heats`);
}

/** Sets when a heat is due to start. Free text, because it is only a plan. */
export async function setHeatTime(heatId: string, formData: FormData) {
  const competitionId = text(formData, "competitionId");
  const eventId = text(formData, "eventId");
  await db.heat.update({
    where: { id: heatId },
    data: { startsAt: text(formData, "startsAt") || null },
  });
  revalidatePath(`/competitions/${competitionId}/events/${eventId}/heats`);
}
