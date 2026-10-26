import { sharedCompetition } from "@/lib/access";
import { LeaderboardView } from "@/components/views/leaderboard";

export const dynamic = "force-dynamic";

/** The leaderboard, for anyone with the share link. No login, nothing to change. */
export default async function SharedLeaderboardPage({ params }: { params: Promise<{ code: string }> }) {
  const id = await sharedCompetition((await params).code);
  return <LeaderboardView id={id} back={null} />;
}
