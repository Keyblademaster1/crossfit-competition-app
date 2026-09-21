import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadLeaderboard } from "@/lib/leaderboard";
import { Card, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const competition = await db.competition.findUnique({ where: { id } });
  if (!competition) notFound();

  const { events, divisions } = await loadLeaderboard(id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/competitions/${competition.id}`}
          className="text-sm text-muted hover:underline"
        >
          ← {competition.name}
        </Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted">
          Lowest total wins. Each cell shows the points earned in that event.
        </p>
      </div>

      {divisions.length === 0 && <Empty>Nothing to show yet.</Empty>}

      {divisions.map((division) => (
        <Card key={division.divisionId ?? "none"} title={division.divisionName}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-xs font-semibold uppercase tracking-[.06em] text-muted">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Name</th>
                  {events.map((event) => (
                    <th key={event.id} className="py-2 pr-3 text-right font-medium">
                      {event.name}
                    </th>
                  ))}
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {division.rows.map((row) => (
                  <tr
                    key={row.unitId}
                    className="border-b border-line last:border-0"
                  >
                    <td className="py-2 pr-3 text-lg font-semibold tabular-nums">
                      {row.position || "—"}
                    </td>
                    <td className="py-2 pr-3 text-lg">{row.name}</td>
                    {events.map((event) => (
                      <td
                        key={event.id}
                        className="py-2 pr-3 text-right tabular-nums text-muted"
                      >
                        {row.pointsByEvent[event.id] ?? "–"}
                      </td>
                    ))}
                    <td className="py-2 text-right text-lg font-semibold tabular-nums">
                      {row.totalPoints}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
