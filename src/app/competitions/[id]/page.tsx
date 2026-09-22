import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { addAthlete, addDivision, addEvent, addTeam, deleteAthlete } from "@/lib/actions";
import { Button, Card, Field, Empty, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CompetitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // In this version of Next.js the route parameters arrive as a promise.
  const { id } = await params;

  const competition = await db.competition.findUnique({
    where: { id },
    include: {
      divisions: { orderBy: { position: "asc" } },
      athletes: { orderBy: { name: "asc" }, include: { division: true } },
      teams: { where: { eventId: null }, orderBy: { name: "asc" }, include: { division: true } },
      events: { orderBy: { position: "asc" } },
    },
  });

  if (!competition) notFound();

  const isScramble = competition.mode === "SCRAMBLE";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{competition.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {isScramble
              ? `Scrambled teams of ${competition.teamSize ?? 2} — individuals carry the points`
              : "Fixed teams — teams carry the points"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Link
          href={`/competitions/${competition.id}/events`}
          className="inline-flex h-11 items-center rounded-lg border border-line bg-card px-4 text-[15px] font-semibold"
        >
          Build events
        </Link>
        <Link
          href={`/competitions/${competition.id}/screen/workout`}
          className="inline-flex h-11 items-center rounded-lg border border-line bg-card px-4 text-[15px] font-semibold"
        >
          Workout screen
        </Link>
        <Link
          href={`/competitions/${competition.id}/screen/leaderboard`}
          className="inline-flex h-11 items-center rounded-lg border border-line bg-card px-4 text-[15px] font-semibold"
        >
          Leaderboard screen
        </Link>
        <Link
          href={`/competitions/${competition.id}/leaderboard`}
          className="inline-flex h-11 items-center rounded-lg px-4 text-[15px] font-semibold text-white"
          style={{ background: "var(--brand-primary)" }}
        >
          Leaderboard
        </Link>
        </div>
      </div>

      <Card title="Events">
        {competition.events.length === 0 ? (
          <Empty>No events yet. Add the first workout below.</Empty>
        ) : (
          <ul className="mb-4 divide-y divide-line">
            {competition.events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/competitions/${competition.id}/events/${event.id}`}
                  className="flex items-center justify-between py-3 hover:opacity-70"
                >
                  <span className="font-medium">{event.name}</span>
                  <span className="text-xs text-muted">
                    {describeScoreType(event.scoreType)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <form action={addEvent} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="competitionId" value={competition.id} />
          <Field label="Workout name">
            <input name="name" required placeholder="Event 1 — Fran" className={inputClass} />
          </Field>
          <Field label="Scored by">
            <select name="scoreType" defaultValue="TIME" className={inputClass}>
              <option value="TIME">Time — fastest wins</option>
              <option value="REPS">Reps — most wins</option>
              <option value="ROUNDS_REPS">Rounds + reps — most wins</option>
              <option value="WEIGHT">Weight in kg — heaviest wins</option>
            </select>
          </Field>
          <Field label="Time cap in minutes (optional)">
            <input name="timeCapMinutes" type="number" min={1} className={inputClass} />
          </Field>
          <Field label="Reps per round (rounds + reps only)">
            <input name="repsPerRound" type="number" min={1} className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Add event</Button>
          </div>
        </form>
      </Card>

      <Card title="Divisions">
        <ul className="mb-4 flex flex-wrap gap-2">
          {competition.divisions.map((division) => (
            <li
              key={division.id}
              className="inline-flex h-7 items-center rounded-md bg-paper px-2.5 text-[13px] font-semibold text-muted"
            >
              {division.name}
            </li>
          ))}
        </ul>
        <form action={addDivision} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="competitionId" value={competition.id} />
          <div className="min-w-48 flex-1">
            <Field label="Add a division">
              <input name="name" required placeholder="Scaled Women" className={inputClass} />
            </Field>
          </div>
          <Button type="submit" variant="quiet">Add</Button>
        </form>
      </Card>

      <Card title="Athletes">
        {competition.athletes.length === 0 ? (
          <Empty>No athletes yet.</Empty>
        ) : (
          <ul className="mb-4 divide-y divide-line">
            {competition.athletes.map((athlete) => (
              <li key={athlete.id} className="flex items-center justify-between py-2">
                <span>
                  {athlete.name}
                  <span className="ml-2 text-xs text-muted">
                    {athlete.division?.name ?? "No division"}
                  </span>
                </span>
                <form action={deleteAthlete.bind(null, athlete.id)}>
                  <input type="hidden" name="competitionId" value={competition.id} />
                  <button className="text-xs text-muted hover:text-ink">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={addAthlete} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="competitionId" value={competition.id} />
          <div className="min-w-48 flex-1">
            <Field label="Name">
              <input name="name" required placeholder="Anna Lindqvist" className={inputClass} />
            </Field>
          </div>
          <div className="min-w-40">
            <Field label="Division">
              <select name="divisionId" className={inputClass}>
                <option value="">No division</option>
                {competition.divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button type="submit" variant="quiet">Add athlete</Button>
        </form>
      </Card>

      {!isScramble && (
        <Card title="Teams">
          {competition.teams.length === 0 ? (
            <Empty>No teams yet.</Empty>
          ) : (
            <ul className="mb-4 divide-y divide-line">
              {competition.teams.map((team) => (
                <li key={team.id} className="flex items-center justify-between py-2">
                  <span>{team.name}</span>
                  <span className="text-xs text-muted">
                    {team.division?.name ?? "No division"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form action={addTeam} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="competitionId" value={competition.id} />
            <div className="min-w-48 flex-1">
              <Field label="Team name">
                <input name="name" required placeholder="Barbell Belles" className={inputClass} />
              </Field>
            </div>
            <div className="min-w-40">
              <Field label="Division">
                <select name="divisionId" className={inputClass}>
                  <option value="">No division</option>
                  {competition.divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Button type="submit" variant="quiet">Add team</Button>
          </form>
        </Card>
      )}
    </div>
  );
}

function describeScoreType(scoreType: string): string {
  switch (scoreType) {
    case "TIME":
      return "Time";
    case "REPS":
      return "Reps";
    case "ROUNDS_REPS":
      return "Rounds + reps";
    case "WEIGHT":
      return "Weight";
    default:
      return scoreType;
  }
}
