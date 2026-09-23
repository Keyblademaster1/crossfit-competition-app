import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { byName } from "@/lib/order";
import { saveScore, saveScrambleTeamScore } from "@/lib/actions";
import { formatScore, formatTime, type ScoreType } from "@/lib/score-format";
import {
  rankEvent,
  describePointsSystem,
  describeTieRule,
  type ScoreStatus,
} from "@/lib/scoring";
import { reviewTeams, pairKey } from "@/lib/scramble";
import { describeReached, whereTheyReached, repSequence, versionOf } from "@/lib/workout";
import { teamClass, classLabel } from "@/lib/team-class";
import { ScoreFields } from "@/components/score-fields";
import { AutoSaveForm } from "@/components/auto-save-form";
import { ContinueButton } from "@/components/continue-button";

/**
 * Score entry, from Scoring.dc.html.
 *
 * Built for one person on a laptop between heats, so the layout puts the
 * scoring boxes in a straight column and keeps the running order visible in a
 * sidebar. Times and rounds are typed into separate boxes, which is quicker
 * than typing punctuation.
 */

export const dynamic = "force-dynamic";

/** The units being scored, with the names to show and any existing score. */
interface ScoreRow {
  key: string;
  /** athleteId or teamId, depending on the competition. */
  unitId: string;
  field: "athleteId" | "teamId" | "scrambleTeamId";
  title: string;
  subtitle: string;
  value: number | null;
  status: ScoreStatus;
  tiebreakSeconds: number | null;
  /** Whose version of the workout they did: a fixed team's division, else null. */
  divisionId: string | null;
}

export default async function ScoringPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  const { id, eventId } = await params;

  const [competition, event] = await Promise.all([
    db.competition.findUnique({
      where: { id },
      include: {
        athletes: { orderBy: { name: "asc" }, include: { division: true } },
        teams: {
          where: { eventId: null },
          orderBy: { name: "asc" },
          include: { division: true, members: { include: { athlete: { select: { gender: true } } } } },
        },
        events: { orderBy: [{ position: "asc" }, { name: "asc" }], include: { scores: true } },
        divisions: { orderBy: { position: "asc" } },
      },
    }),
    db.event.findUnique({
      where: { id: eventId },
      include: {
        scores: true,
        blocks: {
          orderBy: { position: "asc" },
          include: { movements: { orderBy: { position: "asc" } } },
        },
      },
    }),
  ]);

  if (!competition || !event || event.competitionId !== competition.id) notFound();

  const isScramble = competition.mode === "SCRAMBLE";
  const scoreType = event.scoreType as ScoreType;
  const context = { scoreType, repsPerRound: event.repsPerRound };

  // Every rep in the order it is done, so a capped result can be entered as
  // "36 into burpees, round 3" and the finished rounds are counted too. A
  // fixed team is counted through its own division's version: Scaled through
  // the Scaled workout.
  const firstDivision = competition.divisions[0]?.id ?? null;
  const linesFor = (divisionId: string | null) =>
    repSequence(versionOf(event.blocks, divisionId, firstDivision));
  const byDivision = competition.mode === "FIXED_TEAM";

  // This is the list the scorekeeper works down while a heat is on the floor,
  // so the order has to be the one they would count in: Team 9 then Team 10,
  // which is not what sorting names as text gives.
  const drawnTeams = isScramble
    ? (
        await db.team.findMany({
          where: { competitionId: competition.id, eventId },
          include: { members: { include: { athlete: true } }, division: true },
        })
      ).sort(byName)
    : [];

  // Ask the same question of the drawn teams that the draw asked of itself,
  // so the screen can say what it could not satisfy.
  const pastTeams = isScramble
    ? await db.team.findMany({
        where: { competitionId: competition.id, eventId: { not: null, notIn: [eventId] } },
        include: { members: true },
      })
    : [];
  const previousPairs = new Set<string>();
  for (const team of pastTeams) {
    const ids = team.members.map((m) => m.athleteId);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) previousPairs.add(pairKey(ids[i], ids[j]));
    }
  }
  const athleteById = new Map(competition.athletes.map((a) => [a.id, a]));
  const drawWarnings =
    drawnTeams.length > 0
      ? reviewTeams(
          drawnTeams.map((team) =>
            team.members.map((member) => {
              const athlete = athleteById.get(member.athleteId);
              return {
                athleteId: member.athleteId,
                position: 0,
                gender: athlete?.gender ?? null,
                isSixtyPlus: athlete?.isSixtyPlus ?? false,
              };
            }),
          ),
          {
            teammateRule: competition.teammateRule ?? undefined,
            drawGender: competition.drawGender ?? undefined,
            spreadSixtyPlus: competition.spreadSixtyPlus,
            previousPairs,
            totalAthletes: competition.athletes.length,
          },
        )
      : [];

  const scoreFor = new Map(
    event.scores.map((score) => [score.athleteId ?? score.teamId ?? "", score]),
  );

  // Build one row per thing being scored.
  let rows: ScoreRow[];
  if (isScramble && drawnTeams.length > 0) {
    rows = drawnTeams.map((team) => {
      // Everyone on a drawn team shares one result, so read it from any member.
      const existing = team.members.map((m) => scoreFor.get(m.athleteId)).find(Boolean);
      return {
        key: team.id,
        unitId: team.id,
        field: "scrambleTeamId" as const,
        title: team.members.map((m) => m.athlete.name).join(" & "),
        subtitle: [team.name, team.division?.name].filter(Boolean).join(" · "),
        value: existing?.value ?? null,
        status: existing?.status ?? "FINISHED",
        tiebreakSeconds: existing?.tiebreakSeconds ?? null,
        divisionId: null,
      };
    });
  } else {
    // Only fixed teams are scored as teams. An individual competition scores
    // its athletes; this used to list its (non-existent) teams instead.
    const units = byDivision ? competition.teams : competition.athletes;
    rows = units.map((unit) => {
      const existing = scoreFor.get(unit.id);
      const members = "members" in unit ? unit.members : null;
      return {
        key: unit.id,
        unitId: unit.id,
        field: (byDivision ? "teamId" : "athleteId") as "athleteId" | "teamId",
        title: unit.name,
        subtitle: [
          unit.division?.name ?? "No division",
          members ? classLabel(teamClass(members.map((m) => m.athlete.gender))) : null,
        ]
          .filter(Boolean)
          .join(" · "),
        value: existing?.value ?? null,
        status: existing?.status ?? "FINISHED",
        tiebreakSeconds: existing?.tiebreakSeconds ?? null,
        divisionId: byDivision ? unit.divisionId : null,
      };
    });
  }

  const entered = rows.filter(
    (row) => row.value !== null || row.status === "NO_SHOW",
  ).length;

  // Live ranking for the sidebar, from the scores entered so far.
  const ranking = rankEvent(
    rows
      .filter((row) => row.value !== null)
      .map((row) => ({
        unitId: row.unitId,
        value: row.value as number,
        tiebreakSeconds: row.tiebreakSeconds,
        status: row.status,
      })),
    event.higherIsBetter,
    { pointsSystem: competition.pointsSystem, eventTieRule: competition.eventTieRule },
  );
  const titleOf = new Map(rows.map((row) => [row.unitId, row.title]));
  const rowOf = new Map(rows.map((row) => [row.unitId, row]));

  const index = competition.events.findIndex((e) => e.id === event.id);
  const previous = competition.events[index - 1];

  return (
    <div className="-mx-4 -my-6">
      {/* Event tabs, with a filled dot once every score is in. */}
      <header className="border-b border-line bg-card px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap items-center gap-2">
            {competition.events.map((other, position) => {
              const selected = other.id === event.id;
              const done =
                other.scores.length > 0 && other.scores.length >= rows.length && rows.length > 0;
              return (
                <Link
                  key={other.id}
                  href={`/competitions/${competition.id}/events/${other.id}`}
                  className="flex h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-semibold"
                  style={{
                    borderColor: selected ? "var(--ink)" : "var(--line)",
                    background: selected ? "var(--ink)" : "var(--card)",
                    color: selected ? "#fff" : "var(--ink)",
                  }}
                >
                  <span className="font-display num text-[18px]">{position + 1}</span>
                  <span className="max-w-40 truncate">{other.name}</span>
                  {done && <span aria-label="all scores in">✓</span>}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {isScramble && (
              <Link
                href={`/competitions/${competition.id}/events/${event.id}/draw`}
                className="flex h-11 items-center rounded-lg border border-line bg-card px-4 font-semibold"
              >
                Draw teams
              </Link>
            )}
            <Link
              href={`/competitions/${competition.id}/events/${event.id}/heats`}
              className="flex h-11 items-center rounded-lg border border-line bg-card px-4 font-semibold"
            >
              Heats
            </Link>
            <Link
              href={`/competitions/${competition.id}`}
              className="flex h-11 items-center rounded-lg border border-line bg-card px-4 font-semibold"
            >
              Setup
            </Link>
            <Link
              href={`/competitions/${competition.id}/screen/leaderboard`}
              className="flex h-11 items-center rounded-lg border border-line bg-card px-4 font-semibold"
            >
              Open TV leaderboard
            </Link>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-col lg:flex-row">
        <main className="flex min-w-0 flex-1 flex-col gap-5 px-6 py-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
                Event {index + 1} of {competition.events.length} · {kindOf(scoreType)}
              </span>
              <h1 className="font-display text-[44px] font-bold uppercase leading-none">
                {event.name}
              </h1>
              <span className="text-[16px] text-muted">{summaryOf(event, context)}</span>
            </div>
            <span className="font-display num text-[20px] font-bold text-muted">
              {entered} / {rows.length} entered
            </span>
          </div>

          {isScramble && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-4">
              <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
                Teams for this event
              </span>
              <Link
                href={`/competitions/${competition.id}/events/${event.id}/draw`}
                className="flex h-11 items-center rounded-lg border border-line bg-card px-4 font-semibold"
              >
                {drawnTeams.length > 0 ? "Redraw teams" : "Draw teams"}
              </Link>
              {drawWarnings.length > 0 ? (
                <span className="text-[13px] font-semibold" style={{ color: "#8A2A12" }}>
                  {drawWarnings.join(" ")}
                </span>
              ) : (
                <span className="text-[13px] text-muted">
                  {drawnTeams.length > 0
                    ? `${drawnTeams.length} teams drawn.`
                    : "No teams drawn yet."}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-col rounded-xl border border-line bg-card">
            {rows.map((row) => (
              <Row
                key={row.key}
                row={row}
                competitionId={competition.id}
                eventId={event.id}
                context={context}
                timeCapSeconds={event.timeCapSeconds}
                movements={linesFor(row.divisionId)}
              />
            ))}
            {rows.length === 0 && (
              <p className="p-5 text-[15px] text-muted">
                {isScramble
                  ? "Add athletes on the setup page, then draw teams."
                  : "Add teams on the setup page first."}
              </p>
            )}
          </div>

          <div className="mt-auto flex justify-between gap-3">
            {previous ? (
              <Link
                href={`/competitions/${competition.id}/events/${previous.id}`}
                className="flex h-13 items-center rounded-lg border border-line bg-card px-6 font-semibold"
                style={{ height: 52 }}
              >
                ← {previous.name}
              </Link>
            ) : (
              <span />
            )}
            <ContinueButton
              competitionId={competition.id}
              events={competition.events}
              eventId={event.id}
              step="score"
              scrambles={isScramble}
            />
          </div>
        </main>

        <aside className="flex w-full flex-col gap-3 border-t border-line bg-card px-6 py-7 lg:w-[300px] lg:border-l lg:border-t-0">
          <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            Event ranking
          </span>
          {ranking.length === 0 && (
            <p className="text-[14px] text-muted">Nothing entered yet.</p>
          )}
          {ranking.map((entry) => {
            const row = rowOf.get(entry.unitId);
            return (
              <div
                key={entry.unitId}
                className="flex h-13 items-center gap-3 rounded-lg px-3"
                style={{
                  height: 52,
                  background: entry.rank === 1 ? "var(--paper)" : "transparent",
                }}
              >
                <span
                  className="font-display num w-7 text-[24px] font-bold"
                  style={{ color: entry.rank === 1 ? "var(--brand-primary)" : "var(--ink)" }}
                >
                  {entry.rank}
                </span>
                <span className="flex-1 truncate text-[15px] font-semibold">
                  {titleOf.get(entry.unitId)}
                </span>
                <span className="flex flex-col items-end">
                  <span className="font-display num text-[20px] font-bold">{entry.points}</span>
                  <span className="num text-[12px] text-muted">
                    {row ? describeResult(row, context) : ""}
                  </span>
                </span>
              </div>
            );
          })}
          <p className="mt-2 text-[13px] leading-[1.45] text-muted">
            Points each {isScramble ? "athlete" : "team"} gets.{" "}
            {describePointsSystem(competition.pointsSystem)}.{" "}
            {describeTieRule(competition.eventTieRule)}.
          </p>
        </aside>
      </div>
    </div>
  );
}

/** One scoring row: who, the boxes to type into, and the result so far. */
function Row({
  row,
  competitionId,
  eventId,
  context,
  timeCapSeconds,
  movements,
}: {
  row: ScoreRow;
  competitionId: string;
  eventId: string;
  context: { scoreType: ScoreType; repsPerRound: number | null };
  timeCapSeconds: number | null;
  movements: { id: string; name: string; reps: number }[];
}) {
  const action = row.field === "scrambleTeamId" ? saveScrambleTeamScore : saveScore;
  const fieldName = row.field === "scrambleTeamId" ? "teamId" : row.field;

  const finished = row.status === "FINISHED";
  const seconds = row.value ?? 0;
  const mm = row.value !== null && finished ? String(Math.floor(seconds / 60)) : "";
  const ss = row.value !== null && finished ? String(seconds % 60).padStart(2, "0") : "";

  const perRound = context.repsPerRound ?? 0;
  const rounds =
    row.value !== null && finished && perRound > 0
      ? String(Math.floor(row.value / perRound))
      : "";
  const leftover =
    row.value !== null && finished && perRound > 0 ? String(row.value % perRound) : "";

  return (
    <AutoSaveForm
      action={action}
      className="grid items-center gap-4 border-b border-[#EFEADF] px-5 py-3 last:border-0 sm:grid-cols-[150px_minmax(0,1fr)_auto]"
    >
      <input type="hidden" name="competitionId" value={competitionId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name={fieldName} value={row.unitId} />

      <div className="flex flex-col gap-0.5">
        <span className="text-[17px] font-semibold">{row.title}</span>
        <span className="text-[13px] text-muted">{row.subtitle}</span>
      </div>

      <ScoreFields
        scoreType={context.scoreType}
        repsPerRound={context.repsPerRound}
        movements={movements}
        initial={{
          status: row.status,
          movementId:
            row.status === "CAPPED" && row.value !== null
              ? (whereTheyReached(movements, row.value)?.movementId ?? "")
              : (movements[0]?.id ?? ""),
          minutes: mm,
          seconds: ss,
          rounds,
          reps:
            row.status === "CAPPED" && row.value !== null && movements.length > 0
              ? String(whereTheyReached(movements, row.value)?.repsInto ?? row.value)
              : row.status === "CAPPED"
                ? String(row.value ?? "")
                : leftover,
          plain: row.value !== null && finished ? formatScore(row.value, context) : "",
        }}
      />

      <input
        type="hidden"
        name="tiebreakCarried"
        value={row.tiebreakSeconds ? formatTime(row.tiebreakSeconds) : ""}
      />

      <div className="flex items-center gap-3">
        <input
          name="tiebreak"
          aria-label="Tiebreak time"
          defaultValue={row.tiebreakSeconds ? formatTime(row.tiebreakSeconds) : ""}
          placeholder="tie"
          className="font-display num h-12 w-[64px] rounded-lg border border-[#CEC8BA] bg-card text-center text-[20px] font-bold outline-none focus:border-ink"
        />
        <div className="flex min-w-24 flex-col items-end gap-0.5">
          <span className="font-display num text-[24px] font-bold">
            {row.value === null ? "—" : describeResult(row, context)}
          </span>
          <span className="text-[13px] text-muted">
            {row.status === "NO_SHOW"
              ? "no-show · 0 points"
              : row.value === null
                ? "waiting"
                : row.status === "CAPPED"
                  ? movements.length > 0
                    ? // Read back the way a judge would say it.
                      describeReached(movements, row.value)
                    : timeCapSeconds
                      ? `capped at ${formatTime(timeCapSeconds)}`
                      : "capped"
                  : "finished"}
          </span>
        </div>
      </div>
    </AutoSaveForm>
  );
}

function describeResult(
  row: { value: number | null; status: ScoreStatus },
  context: { scoreType: ScoreType; repsPerRound: number | null },
): string {
  if (row.status === "NO_SHOW") return "DNS";
  if (row.value === null) return "—";
  if (row.status === "CAPPED") return `${row.value} reps`;

  return formatScore(row.value, context);
}

function kindOf(scoreType: ScoreType): string {
  switch (scoreType) {
    case "TIME":
      return "Time";
    case "TIME_OR_REPS":
      return "Time or reps";
    case "REPS":
      return "Reps";
    case "ROUNDS_REPS":
      return "Rounds + reps";
    case "WEIGHT":
      return "Max kg";
  }
}

function summaryOf(
  event: { timeCapSeconds: number | null; repsPerRound: number | null },
  context: { scoreType: ScoreType },
): string {
  const parts: string[] = [];
  if (context.scoreType === "TIME" || context.scoreType === "TIME_OR_REPS")
    parts.push("fastest wins");
  if (context.scoreType === "WEIGHT") parts.push("heaviest wins");
  if (context.scoreType === "REPS" || context.scoreType === "ROUNDS_REPS")
    parts.push("most wins");
  if (event.timeCapSeconds) parts.push(`cap ${formatTime(event.timeCapSeconds)}`);
  if (event.repsPerRound) parts.push(`${event.repsPerRound} reps per round`);
  return parts.join(" · ");
}
