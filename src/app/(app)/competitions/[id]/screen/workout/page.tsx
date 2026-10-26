import { ownCompetition } from "@/lib/access";
import { TvWorkoutView } from "@/components/views/tv-workout";

export const dynamic = "force-dynamic";

export default async function WorkoutScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ event?: string; heat?: string }>;
}) {
  const id = await ownCompetition((await params).id);
  return <TvWorkoutView id={id} query={await searchParams} back={`/competitions/${id}`} />;
}
