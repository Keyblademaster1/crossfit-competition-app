import Link from "next/link";
import { db } from "@/lib/db";
import { startCompetition } from "@/lib/actions";
import { Button, Card, Empty } from "@/components/ui";

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
                    <span className="font-medium">{competition.name || "Untitled draft"}</span>
                    <span className="ml-2 text-xs text-muted">
                      {competition.mode === "SCRAMBLE"
                      ? "Scrambled teams"
                      : competition.mode === "FIXED_TEAM"
                        ? "Fixed teams"
                        : competition.mode === "INDIVIDUAL"
                          ? "Individual"
                          : "Format not chosen"}
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
        <form action={startCompetition} className="flex flex-wrap items-center gap-4">
          <Button type="submit">Start a new competition</Button>
          <span className="text-[15px] text-muted">
            Six steps: the basics, scoring rules, format, athletes, events and sharing.
          </span>
        </form>
      </Card>

    </div>
  );
}
