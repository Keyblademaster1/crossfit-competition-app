import { db } from "@/lib/db";
import { loadLeaderboard } from "@/lib/leaderboard";
import { describePointsSystem, describeTieRule } from "@/lib/scoring";

/**
 * The results, as a set of tables ready to be printed or written to a file.
 *
 * Both the results screen and the export go through here, so a spreadsheet
 * and a printed sheet can never disagree about what happened. Nothing here
 * knows about paper or about CSV: it produces headings and rows, and lets
 * each of them lay that out however it needs to.
 */

/** Which parts of the results to include. The organiser picks. */
export type Section = "standings" | "events" | "teams" | "heats";

export const SECTIONS: { id: Section; label: string; on: boolean }[] = [
  { id: "standings", label: "Overall standings", on: true },
  { id: "events", label: "Results per event", on: true },
  { id: "teams", label: "Teams per event", on: false },
  { id: "heats", label: "Heat and lane sheets", on: false },
];

export interface ResultsTable {
  title: string;
  /** A line under the title, e.g. what the event was scored on. */
  subtitle?: string;
  columns: string[];
  /** Columns to set right, by index: the ones holding numbers. */
  rightAlign?: number[];
  rows: string[][];
  /** Printed under the table, e.g. what E1 and E2 stand for. */
  legend?: string[];
}

export interface ResultsDocument {
  name: string;
  /** "17 October 2026 · Holger, Skurup", or as much of it as is known. */
  occasion: string;
  /** The scoring rules, printed at the foot of every sheet. */
  note: string;
  tables: ResultsTable[];
}

/** The competition's date and place, as much as has been filled in. */
function describeOccasion(date: Date | null, venue: string | null): string {
  const parts: string[] = [];
  if (date) {
    parts.push(
      date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    );
  }
  if (venue) parts.push(venue);
  return parts.join(" · ");
}

/** Everyone in a lane or on a team, as one name. */
function membersOf(team: { members: { athlete: { name: string } }[] }): string {
  return team.members.map((member) => member.athlete.name).join(" & ");
}

export async function loadResults(
  competitionId: string,
  include: Section[],
): Promise<ResultsDocument> {
  const competition = await db.competition.findUnique({
    where: { id: competitionId },
  });
  if (!competition) throw new Error("Competition not found");

  const { events, divisions } = await loadLeaderboard(competitionId);
  const unit = competition.mode === "FIXED_TEAM" ? "Team" : "Athlete";
  const tables: ResultsTable[] = [];

  // Events are referred to as E1, E2 across the standings, because the full
  // names do not fit a column and a sheet has to stay readable.
  const shortNames = new Map(events.map((event, index) => [event.id, `E${index + 1}`]));
  const legend = events.map((event) => `${shortNames.get(event.id)} ${event.name}`);

  if (include.includes("standings")) {
    for (const division of divisions) {
      tables.push({
        title:
          divisions.length > 1 ? `Standings · ${division.divisionName}` : "Overall standings",
        columns: ["Place", unit, ...events.map((e) => shortNames.get(e.id)!), "Points"],
        rightAlign: [0, ...events.map((_, index) => index + 2), events.length + 2],
        rows: division.rows.map((row) => [
          row.position ? String(row.position) : "–",
          row.name,
          ...events.map((event) => {
            const place = row.placesByEvent[event.id];
            const result = row.resultsByEvent[event.id];
            if (place === undefined) return "–";
            return result ? `${place} · ${result}` : String(place);
          }),
          String(row.totalPoints),
        ]),
        legend,
      });
    }
  }

  if (include.includes("events")) {
    for (const event of events) {
      for (const division of divisions) {
        // Only the entrants who actually have a result in this event, in the
        // order they finished it rather than the order they stand overall.
        const entered = division.rows
          .filter((row) => row.placesByEvent[event.id] !== undefined)
          .sort(
            (a, b) => a.placesByEvent[event.id]! - b.placesByEvent[event.id]!,
          );
        if (entered.length === 0) continue;

        tables.push({
          title: divisions.length > 1
            ? `${event.name} · ${division.divisionName}`
            : event.name,
          subtitle: `${entered.length} of ${division.rows.length} scored`,
          columns: ["Place", unit, "Result", "Points"],
          rightAlign: [0, 3],
          rows: entered.map((row) => [
            String(row.placesByEvent[event.id]),
            row.name,
            row.resultsByEvent[event.id] ?? "–",
            String(row.pointsByEvent[event.id] ?? 0),
          ]),
        });
      }
    }
  }

  if (include.includes("teams")) {
    const teams = await db.team.findMany({
      where: { competitionId },
      orderBy: [{ eventId: "asc" }, { name: "asc" }],
      include: {
        event: { select: { name: true, position: true } },
        members: { include: { athlete: true } },
      },
    });

    // Scramble teams belong to one event; fixed teams last the whole day.
    const byEvent = new Map<string, typeof teams>();
    for (const team of teams) {
      const key = team.event?.name ?? "Teams";
      byEvent.set(key, [...(byEvent.get(key) ?? []), team]);
    }

    for (const [eventName, group] of byEvent) {
      tables.push({
        title: eventName === "Teams" ? "Teams" : `Teams · ${eventName}`,
        columns: ["Team", "Athletes"],
        rows: group.map((team) => [team.name, membersOf(team)]),
      });
    }
  }

  if (include.includes("heats")) {
    const withHeats = await db.event.findMany({
      where: { competitionId },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: {
        heats: {
          orderBy: { number: "asc" },
          include: {
            lanes: {
              orderBy: { number: "asc" },
              include: {
                athlete: true,
                team: { include: { members: { include: { athlete: true } } } },
              },
            },
          },
        },
      },
    });

    for (const event of withHeats) {
      if (event.heats.length === 0) continue;
      tables.push({
        title: `Heats · ${event.name}`,
        // A lane holds whoever is in it, which in a scramble is a pair.
        columns: ["Heat", "Starts", "Lane", unit === "Team" ? "Team" : "Athletes"],
        rightAlign: [0, 2],
        rows: event.heats.flatMap((heat) =>
          heat.lanes.map((lane) => [
            String(heat.number),
            heat.startsAt ?? "–",
            String(lane.number),
            lane.team ? membersOf(lane.team) : (lane.athlete?.name ?? "Empty"),
          ]),
        ),
      });
    }
  }

  return {
    name: competition.name,
    occasion: describeOccasion(competition.date, competition.venue),
    note: `${describePointsSystem(competition.pointsSystem)} · ${describeTieRule(
      competition.eventTieRule,
    )}`,
    tables,
  };
}

/** Which sections a set of search parameters asks for. */
export function sectionsFrom(params: Record<string, string | undefined>): Section[] {
  return SECTIONS.filter((section) => {
    const asked = params[section.id];
    return asked === undefined ? section.on : asked === "1";
  }).map((section) => section.id);
}
