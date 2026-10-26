import Link from "next/link";
import { LIMITS, type Limited } from "@/lib/limits";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

/** What each limit is of, in words. */
const WHAT: Record<Limited, (n: number) => string> = {
  competitions: (n) => `A club can have up to ${n} competitions.`,
  divisions: (n) => `A competition can have up to ${n} divisions.`,
  athletes: (n) => `A competition can have up to ${n} athletes.`,
  teams: (n) => `A competition can have up to ${n} teams.`,
  events: (n) => `A competition can have up to ${n} events.`,
  blocks: (n) => `An event can have up to ${n} parts.`,
  movements: (n) => `A part of an event can have up to ${n} movements.`,
};

/**
 * Where someone lands when adding something would go over a limit
 * (src/lib/limits.ts). Nothing was added.
 */
export default async function LimitPage({ searchParams }: { searchParams: Promise<{ what?: string }> }) {
  const { what } = await searchParams;
  const known = what && what in WHAT ? (what as Limited) : null;

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">That is the limit</h1>
      <Card>
        <div className="space-y-3 text-[15px]">
          <p>{known ? WHAT[known](LIMITS[known]) : "That would go over one of the app's limits."}</p>
          <p className="text-muted">
            Nothing was added. The limits keep the free hosting from filling up for everyone. If
            you need more, get in touch, or delete something you no longer need.
          </p>
        </div>
      </Card>
      <p className="text-center text-[15px]">
        <Link href="/" className="font-semibold text-ink underline">
          Back to your competitions
        </Link>
      </p>
    </div>
  );
}
