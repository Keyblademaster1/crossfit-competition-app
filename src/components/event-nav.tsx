import Link from "next/link";

/**
 * Moving between the three screens that belong to one event.
 *
 * Drawing the teams, working out the heats and entering the scores happen one
 * after another and then get revisited out of order all day. Without this you
 * had to go back to the competition and in again each time.
 */
export function EventNav({
  competitionId,
  eventId,
  eventName,
  current,
  showDraw,
}: {
  competitionId: string;
  eventId: string;
  eventName: string;
  current: "draw" | "heats" | "score";
  /** Only a scrambled competition draws teams before each event. */
  showDraw: boolean;
}) {
  const base = `/competitions/${competitionId}/events/${eventId}`;
  const steps = [
    { id: "draw", label: "Draw teams", href: `${base}/draw`, shown: showDraw },
    { id: "heats", label: "Heats", href: `${base}/heats`, shown: true },
    { id: "score", label: "Scores", href: base, shown: true },
  ].filter((step) => step.shown);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href={`/competitions/${competitionId}`}
        className="text-[14px] text-muted hover:underline"
      >
        ← {eventName}
      </Link>

      <div className="flex overflow-hidden rounded-lg border border-line">
        {steps.map((step) => (
          <Link
            key={step.id}
            href={step.href}
            className="flex h-10 items-center px-4 text-[15px] font-semibold"
            style={{
              background: step.id === current ? "var(--ink)" : "var(--card)",
              color: step.id === current ? "#fff" : "var(--ink)",
            }}
          >
            {step.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
