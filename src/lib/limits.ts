import { redirect } from "next/navigation";
import { db } from "@/lib/db";

/**
 * How much any one club can add.
 *
 * The hosted app runs on free plans that are never given a payment card, so
 * running out of room means the database stops taking writes rather than a
 * bill, but it would stop for every club at once. These limits keep one club,
 * by mistake or on purpose, from filling it for the rest.
 *
 * Each is far beyond a real box competition, so nobody running one should
 * ever meet them.
 */
export const LIMITS = {
  competitions: 50, // per club
  divisions: 20, // per competition
  athletes: 500, // per competition
  teams: 300, // per competition, not counting each event's scrambled teams
  events: 30, // per competition
  blocks: 40, // per event, across all its versions
  movements: 30, // per block
  newClubsPerDay: 50, // across the whole app
  logoBytes: 200 * 1024, // per logo
} as const;

export type Limited = Exclude<keyof typeof LIMITS, "newClubsPerDay" | "logoBytes">;

const count: Record<Limited, (inside: string) => Promise<number>> = {
  competitions: (clubId) => db.competition.count({ where: { clubId } }),
  divisions: (competitionId) => db.division.count({ where: { competitionId } }),
  athletes: (competitionId) => db.athlete.count({ where: { competitionId } }),
  teams: (competitionId) => db.team.count({ where: { competitionId, eventId: null } }),
  events: (competitionId) => db.event.count({ where: { competitionId } }),
  blocks: (eventId) => db.block.count({ where: { eventId } }),
  movements: (blockId) => db.movement.count({ where: { blockId } }),
};

/**
 * Checks there is room for `adding` more of something, inside the club,
 * competition, event or block whose id is given. If not, the organiser is
 * shown a page saying which limit, and nothing is added.
 */
export async function checkRoom(what: Limited, inside: string, adding = 1): Promise<void> {
  if (adding <= 0) return;
  if ((await count[what](inside)) + adding > LIMITS[what]) redirect(`/limit?what=${what}`);
}

/** How many clubs have started in the last 24 hours. */
export async function newClubsToday(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return db.club.count({ where: { createdAt: { gte: since } } });
}

/** Whether the app has already taken in as many new clubs as it will today. */
export async function tooManyNewClubs(): Promise<boolean> {
  return (await newClubsToday()) >= LIMITS.newClubsPerDay;
}
