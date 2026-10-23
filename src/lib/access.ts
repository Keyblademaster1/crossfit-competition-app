import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

/**
 * Who may see and change what.
 *
 * Every competition belongs to a club, and nobody outside that club can open
 * or change it. Pages check the competition in their address; actions check
 * the competition their form names and then every other thing they touch, so
 * a block, a team or a score from somewhere else cannot be slipped in.
 *
 * Something that belongs to another club is "not found" rather than
 * "forbidden": an outsider cannot even tell it exists.
 *
 * Actions can be called directly, without the page, so the check lives here,
 * next to the data, and never only in what a page chooses to show. A test
 * (access.test.mts) fails if an action is written without it.
 */

/**
 * The club this request acts for.
 *
 * Until there are logins, that is the database's first club, made the first
 * time it is needed. On a laptop running a competition offline there is only
 * ever the one.
 *
 * Remembered for the rest of the request, so a page that checks several
 * things asks the database once.
 */
export const currentClubId = cache(async (): Promise<string> => {
  const club = await db.club.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (club) return club.id;
  const created = await db.club.create({ data: { name: "My club" }, select: { id: true } });
  return created.id;
});

/** The competition's id, if it belongs to this club. Otherwise "not found". */
export async function ownCompetition(id: string): Promise<string> {
  const clubId = await currentClubId();
  const found = id ? await db.competition.count({ where: { id, clubId } }) : 0;
  if (found === 0) notFound();
  return id;
}

/** Things inside a competition, by the name of the id an action is given. */
type Inside = {
  divisionId?: string | null;
  athleteId?: string | null;
  teamId?: string | null;
  eventId?: string | null;
  blockId?: string | null;
  movementId?: string | null;
  heatId?: string | null;
};

/**
 * Checks that everything named belongs to this competition, and gives "not
 * found" if anything does not. Leaving an id out, or passing an empty one,
 * skips it, since many are optional.
 *
 * Call it after ownCompetition, which settles whose competition it is.
 */
export async function assertInside(competitionId: string, ids: Inside): Promise<void> {
  const where = { competitionId };
  const inEvent = { event: { competitionId } };
  const counts = await Promise.all([
    ids.divisionId ? db.division.count({ where: { id: ids.divisionId, ...where } }) : 1,
    ids.athleteId ? db.athlete.count({ where: { id: ids.athleteId, ...where } }) : 1,
    ids.teamId ? db.team.count({ where: { id: ids.teamId, ...where } }) : 1,
    ids.eventId ? db.event.count({ where: { id: ids.eventId, ...where } }) : 1,
    ids.blockId ? db.block.count({ where: { id: ids.blockId, ...inEvent } }) : 1,
    ids.movementId ? db.movement.count({ where: { id: ids.movementId, ...inEvent } }) : 1,
    ids.heatId ? db.heat.count({ where: { id: ids.heatId, ...inEvent } }) : 1,
  ]);
  if (counts.includes(0)) notFound();
}
