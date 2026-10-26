import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth, loginsOn } from "@/lib/auth";

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
 * Who is logged in, with their club, or null if nobody is. Never redirects,
 * so the header can ask on every page, the login page included.
 *
 * Remembered for the rest of the request, so a page that checks several
 * things asks the database once.
 */
export const currentUser = cache(async () => {
  if (!loginsOn) return null;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, club: { select: { id: true, name: true } } },
  });
  return user;
});

/**
 * The club this request acts for: the club of whoever is logged in. Anyone
 * not logged in is sent to the login page, and anyone without a club yet to
 * the page that makes one.
 *
 * On a laptop running offline (no logins), it is the database's first club,
 * made the first time it is needed. There is only ever the one.
 */
export const currentClubId = cache(async (): Promise<string> => {
  if (loginsOn) {
    const user = await currentUser();
    if (!user) redirect("/login");
    // Logged in for the first time, and not yet said what their club is.
    if (!user.club) redirect("/welcome");
    return user.club.id;
  }
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
