import { ownCompetition } from "@/lib/access";
import { LeaderboardView } from "@/components/views/leaderboard";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const id = await ownCompetition((await params).id);
  return <LeaderboardView id={id} back={`/competitions/${id}`} />;
}
