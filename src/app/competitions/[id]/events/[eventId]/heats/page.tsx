import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { generateHeats, setHeatTime } from "@/lib/actions";
import { AutoSaveForm } from "@/components/auto-save-form";
import { loadBar, readKilos, barFor, PLATES } from "@/lib/plates";

/**
 * Heats and lanes, from Heats.dc.html.
 *
 * Who is on the floor together, in which lane, and what each bar needs
 * loading to. The plates are worked out here so whoever sets the floor up
 * does not have to, and so nobody is doing arithmetic while a heat waits.
 */

export const dynamic = "force-dynamic";

/** Which sort of pair a team is, which is what decides its loads. */
function teamCategory(genders: (string | null)[], anySixtyPlus: boolean): {
  label: string;
  field: "loadMenMen" | "loadWomenWomen" | "loadMixed" | "loadSixtyPlus";
} {
  if (anySixtyPlus) return { label: "60+", field: "loadSixtyPlus" };
  const known = genders.filter(Boolean);
  if (known.length > 1 && known.every((g) => g === "MAN")) {
    return { label: "M/M", field: "loadMenMen" };
  }
  if (known.length > 1 && known.every((g) => g === "WOMAN")) {
    return { label: "W/W", field: "loadWomenWomen" };
  }
  return { label: "Mixed", field: "loadMixed" };
}

export default async function HeatsPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  const { id, eventId } = await params;

  const [competition, event] = await Promise.all([
    db.competition.findUnique({ where: { id } }),
    db.event.findUnique({
      where: { id: eventId },
      include: {
        movements: { orderBy: { position: "asc" } },
        heats: {
          orderBy: { number: "asc" },
          include: {
            lanes: {
              orderBy: { number: "asc" },
              include: {
                athlete: true,
                team: { include: { members: { include: { athlete: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);
  if (!competition || !event || event.competitionId !== competition.id) notFound();

  // Only the movements that need a bar are worth showing on the floor plan.
  const loaded = event.movements.filter(
    (movement) =>
      readKilos(movement.loadMenMen) !== null ||
      readKilos(movement.loadWomenWomen) !== null ||
      readKilos(movement.loadMixed) !== null ||
      readKilos(movement.loadSixtyPlus) !== null,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            {event.heats.length} heats · {competition.lanesPerHeat} lanes
          </span>
          <h1 className="font-display text-[44px] font-bold uppercase leading-none">
            Heats for {event.name}
          </h1>
        </div>
        <Link
          href={`/competitions/${competition.id}/events/${eventId}`}
          className="flex h-12 items-center rounded-lg border border-line bg-card px-5 font-semibold"
        >
          Back to scoring
        </Link>
      </div>

      <form action={generateHeats} className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-card p-4">
        <input type="hidden" name="competitionId" value={competition.id} />
        <input type="hidden" name="eventId" value={eventId} />

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            Lanes on the floor
          </span>
          <input
            name="lanesPerHeat"
            type="number"
            min={1}
            max={12}
            defaultValue={competition.lanesPerHeat}
            className="h-11 w-24 rounded-lg border border-line bg-card px-3 text-center text-[16px] font-semibold"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            Running order
          </span>
          <select name="order" defaultValue="STANDING" className="h-11 rounded-lg border border-line bg-card px-3 text-[16px] font-semibold">
            <option value="STANDING">By standing — leaders last</option>
            <option value="RANDOM">Random</option>
          </select>
        </label>

        <button
          type="submit"
          className="flex h-11 items-center rounded-lg px-5 font-semibold text-white"
          style={{ background: "var(--brand-primary)" }}
        >
          {event.heats.length > 0 ? "Work them out again" : "Work out the heats"}
        </button>

        {event.heats.length > 0 && (
          <span className="text-[13px] text-muted">
            Redoing this replaces the heats. Scores are not affected.
          </span>
        )}
      </form>

      {event.heats.length === 0 && (
        <p className="text-[15px] text-muted">
          No heats yet. Draw the teams first, then work out the heats here.
        </p>
      )}

      {event.heats.map((heat) => (
        <div key={heat.id} className="flex flex-col gap-3 rounded-xl border border-line bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-display text-[26px] font-bold uppercase">
              Heat {heat.number}
            </span>
            <AutoSaveForm action={setHeatTime.bind(null, heat.id)} className="flex items-center gap-2">
              <input type="hidden" name="competitionId" value={competition.id} />
              <input type="hidden" name="eventId" value={eventId} />
              <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
                Starts
              </span>
              <input
                name="startsAt"
                defaultValue={heat.startsAt ?? ""}
                placeholder="13:30"
                aria-label={`When heat ${heat.number} starts`}
                className="font-display num h-10 w-24 rounded-lg border border-[#CEC8BA] bg-card text-center text-[18px] font-bold outline-none focus:border-ink"
              />
            </AutoSaveForm>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {heat.lanes.map((lane) => {
              const people = lane.team
                ? lane.team.members.map((m) => m.athlete)
                : lane.athlete
                  ? [lane.athlete]
                  : [];
              const category = teamCategory(
                people.map((p) => p.gender),
                people.some((p) => p.isSixtyPlus),
              );

              return (
                <div key={lane.id} className="flex flex-col gap-2 rounded-lg p-3" style={{ background: "var(--paper)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-[15px] font-bold uppercase text-muted">
                      Lane {lane.number}
                    </span>
                    <span
                      className="rounded px-2 py-0.5 text-[12px] font-bold"
                      style={{
                        background: category.label === "60+" ? "var(--ink)" : "var(--card)",
                        color: category.label === "60+" ? "#fff" : "var(--muted)",
                      }}
                    >
                      {category.label}
                    </span>
                  </div>

                  <span className="text-[16px] font-semibold">
                    {people.map((p) => p.name).join(" & ") || "Empty"}
                  </span>

                  {loaded.map((movement) => {
                    const kilos = readKilos(movement[category.field]);
                    if (kilos === null) return null;

                    // A shared load is one bar for the team. Otherwise each
                    // athlete has their own, and a mixed pair means two
                    // different bars for the same weight: 20 kg and 15 kg.
                    const bars =
                      movement.loadMode === "SHARED"
                        ? [{ who: "shared", gender: people[0]?.gender ?? null }]
                        : people.map((person) => ({
                            who: person.name,
                            gender: person.gender,
                          }));

                    return (
                      <div key={movement.id} className="flex flex-col gap-1">
                        <span className="text-[13px] text-muted">
                          {movement.name} · {movement[category.field]}
                          {movement.loadMode === "SHARED" ? " · shared" : ""}
                        </span>
                        {movement.implement === "BARBELL" ? (
                          bars.map((entry, index) => (
                            <Barbell
                              key={index}
                              who={bars.length > 1 ? entry.who : null}
                              loading={loadBar(kilos, barFor(entry.gender))}
                            />
                          ))
                        ) : (
                          // Not a barbell, so there are no plates to make up.
                          <Implement kind={movement.implement} kilos={kilos} />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Anything that is not a barbell: it weighs what it weighs. */
function Plate({ kg }: { kg: number }) {
  const plate = PLATES.find((p) => p.kg === kg)!;
  return (
    <span
      className="shrink-0 rounded-[2px]"
      style={{
        background: plate.colour,
        width: plate.width * 0.55,
        height: plate.height * 0.4,
        border: plate.kg === 5 ? "1px solid #555" : undefined,
      }}
    />
  );
}

function Implement({ kind, kilos }: { kind: string; kilos: number }) {
  const label = kind.charAt(0) + kind.slice(1).toLowerCase();
  return (
    <span className="flex items-center gap-2">
      <span
        style={{
          width: 26,
          height: 18,
          background: "#1B1B1B",
          borderRadius: 5,
        }}
      />
      <span className="font-display num text-[13px] font-bold text-muted">
        {kilos} kg {label.toLowerCase()}
      </span>
    </span>
  );
}

/** The whole bar, plates on both sides, in the colours they come in. */
function Barbell({
  loading,
  who,
}: {
  loading: ReturnType<typeof loadBar>;
  /** Whose bar this is, when a team has more than one. */
  who: string | null;
}) {
  if (loading.shortBy !== 0) {
    return (
      <span className="text-[13px] font-semibold" style={{ color: "#8A2A12" }}>
        {loading.shortBy < 0
          ? `Lighter than the ${loading.bar} kg bar`
          : `Cannot be loaded — ${loading.shortBy} kg short`}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {who && (
        <span className="w-12 shrink-0 truncate text-[12px] text-muted">{who}</span>
      )}

      <span className="flex flex-col items-center" title={`${loading.bar} kg bar`}>
        {/* The bar's own weight belongs over the bar, not beside the plates,
            where it read as though it were another plate. */}
        <span className="font-display num text-[11px] font-bold leading-none text-muted">
          {loading.bar}
        </span>
        {/* Tucked up close, so the weight reads as belonging to the bar
            rather than floating above the whole lane. */}
        <span className="-mt-[3px] flex items-center gap-[2px]">
          {/* The heaviest plate goes on first, so it sits nearest the middle.
              Reading outwards they get lighter, which makes the left-hand
              side the same list backwards. */}
          {[...loading.perSide].reverse().map((kg, index) => (
            <Plate key={`left-${index}`} kg={kg} />
          ))}
          <span className="h-[5px] w-2 shrink-0" style={{ background: "#8E877A" }} />
          <span className="h-[4px] w-7 shrink-0" style={{ background: "#B9B2A4" }} />
          <span className="h-[5px] w-2 shrink-0" style={{ background: "#8E877A" }} />
          {loading.perSide.map((kg, index) => (
            <Plate key={`right-${index}`} kg={kg} />
          ))}
        </span>
      </span>

      {loading.perSide.length > 0 && (
        <span className="font-display num whitespace-nowrap text-[13px] font-bold text-muted">
          {loading.perSide.join(" + ")} a side
        </span>
      )}
    </span>
  );
}
