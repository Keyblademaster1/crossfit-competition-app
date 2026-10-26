import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/access";
import { LIMITS, newClubsToday } from "@/lib/limits";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Supabase's free plan: the database may grow to this before it stops taking writes. */
const FREE_DATABASE_BYTES = 500 * 1024 * 1024;

/**
 * How full the free hosting is, and who is using it. Only for the people
 * whose Google emails are listed in ADMIN_EMAILS; anyone else, logged in or
 * not, gets "not found", so they cannot tell it exists.
 */
export default async function AdminPage() {
  if (!isAdmin(await currentUser())) notFound();

  const [[{ bytes }], newClubs, clubs] = await Promise.all([
    db.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
    newClubsToday(),
    db.club.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        users: { select: { email: true } },
        competitions: { select: { _count: { select: { athletes: true, events: true } } } },
      },
    }),
  ]);
  const used = Number(bytes);
  const share = used / FREE_DATABASE_BYTES;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>

      <Card title="Database">
        <p className="text-[15px]">
          <span className="text-2xl font-semibold tabular-nums">{megabytes(used)}</span> of{" "}
          {megabytes(FREE_DATABASE_BYTES)} free ({Math.round(share * 100)}%)
        </p>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, share * 100)}%`,
              background: share > 0.8 ? "#B3261E" : "var(--brand-primary)",
            }}
          />
        </div>
        <p className="mt-3 text-[14px] text-muted">
          At 500 MB the database stops taking new scores, for every club. New clubs today:{" "}
          {newClubs} of at most {LIMITS.newClubsPerDay}.
        </p>
      </Card>

      <Card title={`Clubs (${clubs.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[15px]">
            <thead>
              <tr className="border-b border-line text-xs font-semibold uppercase tracking-[.06em] text-muted">
                <th className="py-2 pr-3 font-medium">Club</th>
                <th className="py-2 pr-3 font-medium">Organisers</th>
                <th className="py-2 pr-3 text-right font-medium">Competitions</th>
                <th className="py-2 pr-3 text-right font-medium">Athletes</th>
                <th className="py-2 text-right font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {clubs.map((club) => (
                <tr key={club.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 font-semibold">{club.name}</td>
                  <td className="py-2 pr-3 text-muted">
                    {club.users.map((u) => u.email).join(", ") || "none"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{club.competitions.length}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {club.competitions.reduce((sum, c) => sum + c._count.athletes, 0)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted">
                    {club.createdAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
