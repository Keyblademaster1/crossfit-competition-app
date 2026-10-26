import { ownCompetition } from "@/lib/access";
import { TvLeaderboardView } from "@/components/views/tv-leaderboard";

export const dynamic = "force-dynamic";

export default async function LeaderboardScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ division?: string; show?: string }>;
}) {
  const id = await ownCompetition((await params).id);
  return <TvLeaderboardView id={id} query={await searchParams} back={`/competitions/${id}`} />;
}
