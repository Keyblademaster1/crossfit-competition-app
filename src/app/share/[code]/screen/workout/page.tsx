import { sharedCompetition } from "@/lib/access";
import { TvWorkoutView } from "@/components/views/tv-workout";

export const dynamic = "force-dynamic";

/** The TV workout screen, for anyone with the share link. */
export default async function SharedWorkoutScreen({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ event?: string; heat?: string }>;
}) {
  const id = await sharedCompetition((await params).code);
  return <TvWorkoutView id={id} query={await searchParams} back={null} />;
}
