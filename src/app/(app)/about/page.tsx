import Link from "next/link";
import { Card } from "@/components/ui";

/**
 * The app's public home page: what it is, for anyone, logged in or not. It
 * is also the "home page" Google shows on its login screen.
 */
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Box Competitions</h1>
        <p className="mt-2 text-[17px] text-muted">
          Free scoring for in-house competitions at CrossFit and functional fitness boxes.
        </p>
      </div>

      <Card>
        <ul className="list-disc space-y-2 pl-5 text-[15px]">
          <li>Set up a competition: divisions, athletes, teams and events.</li>
          <li>Draw scrambled teams and heats, and enter scores on the day.</li>
          <li>Show a live leaderboard and the workout on a TV, and share a link to them.</li>
          <li>Print or download the results afterwards.</li>
          <li>Runs on a laptop without internet too, for competition day.</li>
        </ul>
      </Card>

      <p className="text-[15px] text-muted">
        Organisers log in with their Google account. Each club sees only its own competitions.
        It costs nothing and shows no adverts.
      </p>

      <div className="flex flex-wrap gap-4 text-[15px]">
        <Link href="/login" className="font-semibold text-ink underline">
          Log in
        </Link>
        <Link href="/privacy" className="font-semibold text-ink underline">
          Privacy policy
        </Link>
      </div>
    </div>
  );
}
