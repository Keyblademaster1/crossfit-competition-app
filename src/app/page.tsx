import Link from "next/link";
import { db } from "@/lib/db";
import { createCompetition } from "@/lib/actions";
import { Button, Card, Field, Empty, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const competitions = await db.competition.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { athletes: true, events: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Competitions</h1>
        <p className="mt-1 text-sm text-muted">
          Scores, standings and team draws for your box.
        </p>
      </div>

      <Card title="Your competitions">
        {competitions.length === 0 ? (
          <Empty>Nothing yet. Create your first competition below.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {competitions.map((competition) => (
              <li key={competition.id}>
                <Link
                  href={`/competitions/${competition.id}`}
                  className="flex items-center justify-between py-3 hover:opacity-70"
                >
                  <span>
                    <span className="font-medium">{competition.name}</span>
                    <span className="ml-2 text-xs text-muted">
                      {competition.mode === "SCRAMBLE" ? "Scrambled teams" : "Fixed teams"}
                    </span>
                  </span>
                  <span className="text-xs text-muted">
                    {competition._count.athletes} athletes · {competition._count.events} events
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="New competition">
        <form action={createCompetition} className="space-y-4">
          <Field label="Name">
            <input name="name" required placeholder="Friday Night Throwdown" className={inputClass} />
          </Field>

          <Field label="Format">
            <select name="mode" defaultValue="SCRAMBLE" className={inputClass}>
              <option value="SCRAMBLE">
                Scrambled teams — individuals score, teams redrawn each event
              </option>
              <option value="FIXED_TEAM">
                Fixed teams — teams score and stay the same all day
              </option>
            </select>
          </Field>

          <Field label="Athletes per team (scrambled format only)">
            <input
              name="teamSize"
              type="number"
              min={1}
              defaultValue={2}
              className={inputClass}
            />
          </Field>

          <Button type="submit">Create competition</Button>
        </form>
      </Card>
    </div>
  );
}
