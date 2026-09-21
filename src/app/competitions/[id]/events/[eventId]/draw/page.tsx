import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { scrambleForEvent } from "@/lib/actions";
import { loadLeaderboard } from "@/lib/leaderboard";
import { pairKey } from "@/lib/scramble";
import { EventNav } from "@/components/event-nav";

/**
 * Drawing the teams before an event, from Scramble.dc.html.
 *
 * Shown on the laptop at the whiteboard between events. The method and the
 * teammate rule can be changed here and drawn again until it looks right,
 * then locked in by going on to score entry.
 *
 * Whether a pair has been together before is worked out from the earlier
 * events rather than stored, so it stays true even if a draw is redone.
 */

export const dynamic = "force-dynamic";

const METHODS = [
  { id: "SNAKE", label: "Best + worst" },
  { id: "HALVES", label: "Top + bottom half" },
  { id: "RANDOM", label: "Random" },
] as const;

const RULES = [
  { id: "ALWAYS_DIFFERENT", label: "Always different" },
  { id: "AVOID_REPEATS", label: "Avoid repeats" },
  { id: "ALLOW_REPEATS", label: "Repeats allowed" },
] as const;

export default async function DrawPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  const { id, eventId } = await params;

  const [competition, event] = await Promise.all([
    db.competition.findUnique({ where: { id }, include: { athletes: true, events: true } }),
    db.event.findUnique({ where: { id: eventId } }),
  ]);
  if (!competition || !event || event.competitionId !== competition.id) notFound();

  const teams = await db.team.findMany({
    where: { competitionId: competition.id, eventId },
    orderBy: { name: "asc" },
    include: { members: { include: { athlete: true } } },
  });

  // Who has been together before, from every other event.
  const past = await db.team.findMany({
    where: { competitionId: competition.id, eventId: { not: null, notIn: [eventId] } },
    include: { members: true },
  });
  const previousPairs = new Set<string>();
  for (const team of past) {
    const ids = team.members.map((m) => m.athleteId);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) previousPairs.add(pairKey(ids[i], ids[j]));
    }
  }

  // Standings, so each athlete can be shown with where they currently sit.
  const { divisions } = await loadLeaderboard(competition.id);
  const standing = new Map<string, { position: number; points: number }>();
  for (const division of divisions) {
    for (const row of division.rows) {
      standing.set(row.unitId, { position: row.position, points: row.totalPoints });
    }
  }

  const eventNumber = competition.events.findIndex((e) => e.id === eventId) + 1;
  const teamSize = competition.teamSize ?? 2;

  const drawn = teams.map((team) => {
    const ids = team.members.map((m) => m.athleteId);
    let teamedBefore = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (previousPairs.has(pairKey(ids[i], ids[j]))) teamedBefore = true;
      }
    }
    return { team, teamedBefore };
  });

  const repeats = drawn.filter((d) => d.teamedBefore).length;
  const full = drawn.every((d) => d.team.members.length === teamSize);

  return (
    <div className="flex flex-col gap-6">
      <EventNav
        competitionId={competition.id}
        eventId={eventId}
        eventName={event.name}
        current="draw"
        showDraw={competition.mode === "SCRAMBLE"}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            Before event {eventNumber} · {competition.athletes.length} athletes · teams of {teamSize}
          </span>
          <h1 className="font-display text-[44px] font-bold uppercase leading-none">
            Draw teams for {event.name}
          </h1>
        </div>

        {teams.length > 0 && (
          <Link
            href={`/competitions/${competition.id}/events/${eventId}`}
            className="flex items-center rounded-lg px-6 font-semibold text-white"
            style={{ height: 48, background: "var(--brand-primary)" }}
          >
            Lock teams &amp; start event
          </Link>
        )}
      </div>

      <form action={scrambleForEvent} className="flex flex-wrap items-center gap-8">
        <input type="hidden" name="competitionId" value={competition.id} />
        <input type="hidden" name="eventId" value={eventId} />

        <Pills
          label="Method"
          name="method"
          chosen={competition.drawMethod === "MANUAL" ? "SNAKE" : competition.drawMethod}
          options={METHODS}
        />
        <Pills
          label="Teammates"
          name="teammateRule"
          chosen={competition.teammateRule}
          options={RULES}
        />

        <button
          type="submit"
          className="flex items-center rounded-lg border border-line bg-card px-5 font-semibold"
          style={{ height: 48 }}
        >
          {teams.length > 0 ? "↻ Draw again" : "Draw teams"}
        </button>
      </form>

      {teams.length > 0 && (
        <div
          className="flex items-center gap-2.5 rounded-[10px] px-4.5 py-3.5 text-[16px]"
          style={{
            background: repeats === 0 && full ? "#E7EFE1" : "#F6E7E1",
            color: repeats === 0 && full ? "#2E3D1F" : "#8A2A12",
            paddingLeft: 18,
            paddingRight: 18,
          }}
        >
          <span>
            {!full
              ? `The athletes do not divide evenly into teams of ${teamSize}.`
              : repeats === 0
                ? "Everyone has a new teammate."
                : `${repeats} ${repeats === 1 ? "pair has" : "pairs have"} been together before. There are not enough athletes to avoid it.`}
          </span>
        </div>
      )}

      {teams.length === 0 ? (
        <p className="text-[15px] text-muted">
          No teams drawn yet. Choose how to draw them above.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {drawn.map(({ team, teamedBefore }) => (
            <div
              key={team.id}
              className="flex flex-col gap-3 rounded-xl border border-line bg-card p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[22px] font-bold uppercase">{team.name}</span>
                <span
                  className="rounded-md px-2 py-1 text-[13px] font-semibold"
                  style={{
                    background: teamedBefore ? "#F6E7E1" : "var(--paper)",
                    color: teamedBefore ? "#8A2A12" : "var(--muted)",
                  }}
                >
                  {teamedBefore ? "Teamed before" : "New pair"}
                </span>
              </div>

              {team.members.map((member) => {
                const place = standing.get(member.athleteId);
                return (
                  <div
                    key={member.athleteId}
                    className="flex h-11 items-center gap-3 rounded-lg px-3"
                    style={{ background: "var(--paper)" }}
                  >
                    <span className="font-display num w-8 text-[20px] font-bold text-muted">
                      {place?.position ? `#${place.position}` : "—"}
                    </span>
                    <span className="flex-1 truncate text-[17px] font-semibold">
                      {member.athlete.name}
                    </span>
                    {member.athlete.isSixtyPlus && (
                      <span className="rounded bg-card px-1.5 text-[12px] font-semibold text-muted">
                        60+
                      </span>
                    )}
                    <span className="text-[13px] text-muted">{place?.points ?? 0} pts</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2 text-[14px] text-muted">
        <span>
          {full && teams.length > 0
            ? `All ${teams.length} teams are full.`
            : "Draw again to try a different arrangement."}
        </span>
        <span>Previous teammates are checked across all earlier events.</span>
      </div>
    </div>
  );
}

function Pills({
  label,
  name,
  chosen,
  options,
}: {
  label: string;
  name: string;
  chosen: string;
  options: readonly { id: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-center rounded-lg px-3.5 text-[15px] font-semibold"
            style={{
              height: 40,
              border: `1px solid ${chosen === option.id ? "var(--ink)" : "#CEC8BA"}`,
              background: chosen === option.id ? "var(--ink)" : "var(--card)",
              color: chosen === option.id ? "#fff" : "var(--ink)",
            }}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              defaultChecked={chosen === option.id}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
