import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { saveScore, saveScrambleTeamScore, scrambleForEvent } from "@/lib/actions";
import { formatScore, formatTime, type ScoreType } from "@/lib/score-format";
import { Button, Card, Empty, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EventPage({
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
        teams: { where: { eventId: null }, orderBy: { name: "asc" } },
      },
    }),
    db.event.findUnique({
      where: { id: eventId },
      include: { scores: true },
    }),
  ]);

  if (!competition || !event || event.competitionId !== competition.id) notFound();

  const isScramble = competition.mode === "SCRAMBLE";
  const drawnTeams = isScramble
    ? await db.team.findMany({
        where: { competitionId: competition.id, eventId },
        orderBy: { name: "asc" },
        include: { members: { include: { athlete: true } }, division: true },
      })
    : [];

  const scoreFor = new Map(
    event.scores.map((score) => [score.athleteId ?? score.teamId ?? "", score]),
  );

  const context = { scoreType: event.scoreType as ScoreType, repsPerRound: event.repsPerRound };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/competitions/${competition.id}`}
          className="text-sm text-neutral-500 hover:underline"
        >
          ← {competition.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{event.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {hint(event.scoreType as ScoreType, event.repsPerRound)}
          {event.timeCapSeconds
            ? ` · Cap ${formatTime(event.timeCapSeconds)}. Tick "did not finish" and enter reps instead.`
            : ""}
        </p>
      </div>

      {isScramble && (
        <Card title="Teams for this event">
          <form action={scrambleForEvent} className="mb-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="competitionId" value={competition.id} />
            <input type="hidden" name="eventId" value={event.id} />
            <select name="method" defaultValue="SNAKE" className={`${inputClass} w-auto`}>
              <option value="SNAKE">Best with worst</option>
              <option value="RANDOM">Random</option>
            </select>
            <Button type="submit" variant="quiet">
              {drawnTeams.length > 0 ? "Draw again" : "Draw teams"}
            </Button>
          </form>

          {drawnTeams.length === 0 ? (
            <Empty>
              No teams drawn yet. Draw them above, or enter scores per athlete below.
            </Empty>
          ) : (
            <p className="text-sm text-neutral-500">
              Redrawing replaces these teams. Scores already entered stay with the athletes.
            </p>
          )}
        </Card>
      )}

      <Card title="Scores">
        {isScramble && drawnTeams.length > 0 ? (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {drawnTeams.map((team) => {
              // Everyone on a team shares a score, so read it from any member.
              const existing = team.members
                .map((member) => scoreFor.get(member.athleteId))
                .find(Boolean);
              return (
                <li key={team.id} className="py-3">
                  <div className="mb-2">
                    <span className="font-medium">{team.name}</span>
                    <span className="ml-2 text-xs text-neutral-500">
                      {team.members.map((member) => member.athlete.name).join(" · ")}
                      {team.division ? ` — ${team.division.name}` : ""}
                    </span>
                  </div>
                  <form action={saveScrambleTeamScore} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="competitionId" value={competition.id} />
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="teamId" value={team.id} />
                    <ScoreInputs existing={existing} context={context} />
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {(isScramble ? competition.athletes : competition.teams).map((unit) => {
              const existing = scoreFor.get(unit.id);
              return (
                <li key={unit.id} className="flex flex-wrap items-center gap-2 py-3">
                  <span className="min-w-40 flex-1 font-medium">
                    {unit.name}
                    {"division" in unit && unit.division ? (
                      <span className="ml-2 text-xs text-neutral-500">{unit.division.name}</span>
                    ) : null}
                  </span>
                  <form action={saveScore} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="competitionId" value={competition.id} />
                    <input type="hidden" name="eventId" value={event.id} />
                    <input
                      type="hidden"
                      name={isScramble ? "athleteId" : "teamId"}
                      value={unit.id}
                    />
                    <ScoreInputs existing={existing} context={context} />
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        {(isScramble ? competition.athletes : competition.teams).length === 0 && (
          <Empty>
            Add {isScramble ? "athletes" : "teams"} on the competition page first.
          </Empty>
        )}
      </Card>
    </div>
  );
}

function ScoreInputs({
  existing,
  context,
}: {
  existing: { value: number; tiebreakSeconds: number | null; didNotFinish: boolean } | undefined;
  context: { scoreType: ScoreType; repsPerRound: number | null };
}) {
  const shown = existing
    ? existing.didNotFinish
      ? String(existing.value)
      : formatScore(existing.value, context)
    : "";

  return (
    <>
      <input
        name="value"
        defaultValue={shown}
        placeholder={placeholder(context.scoreType)}
        inputMode={context.scoreType === "TIME" ? "text" : "decimal"}
        className={`${inputClass} w-28`}
      />
      <input
        name="tiebreak"
        defaultValue={existing?.tiebreakSeconds ? formatTime(existing.tiebreakSeconds) : ""}
        placeholder="tiebreak"
        className={`${inputClass} w-24`}
      />
      <label className="flex items-center gap-1 text-xs text-neutral-500">
        <input type="checkbox" name="didNotFinish" defaultChecked={existing?.didNotFinish} />
        DNF
      </label>
      <Button type="submit" variant="quiet">Save</Button>
    </>
  );
}

function placeholder(scoreType: ScoreType): string {
  switch (scoreType) {
    case "TIME":
      return "7:16";
    case "REPS":
      return "154";
    case "ROUNDS_REPS":
      return "5+12";
    case "WEIGHT":
      return "102.5";
  }
}

function hint(scoreType: ScoreType, repsPerRound: number | null): string {
  switch (scoreType) {
    case "TIME":
      return "Enter times as minutes:seconds, for example 7:16. Fastest wins.";
    case "REPS":
      return "Enter total reps. Most wins.";
    case "ROUNDS_REPS":
      return repsPerRound
        ? `Enter as rounds+reps, for example 5+12 (${repsPerRound} reps per round). Most wins.`
        : "Set reps per round on the competition page to use the 5+12 format.";
    case "WEIGHT":
      return "Enter kilograms, for example 102.5. Heaviest wins.";
  }
}
