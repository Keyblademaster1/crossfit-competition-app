import { sharedCompetition } from "@/lib/access";
import { TvLeaderboardView } from "@/components/views/tv-leaderboard";

export const dynamic = "force-dynamic";

/** The TV leaderboard, for anyone with the share link. */
export default async function SharedLeaderboardScreen({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ division?: string; show?: string }>;
}) {
  const id = await sharedCompetition((await params).code);
  return <TvLeaderboardView id={id} query={await searchParams} back={null} />;
}
