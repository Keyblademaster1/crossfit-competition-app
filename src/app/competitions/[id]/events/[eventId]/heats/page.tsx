import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { generateHeats, setHeatTime } from "@/lib/actions";
import { AutoSaveForm } from "@/components/auto-save-form";
import { loadBar, readKilos, barFor, PLATES } from "@/lib/plates";
import { EventNav } from "@/components/event-nav";
import { ContinueButton } from "@/components/continue-button";

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

interface Person {
  name: string;
  gender: string | null;
}

/**
 * The bars a lane needs for one movement.
 *
 * A pair of the same gender lift the same bar, so it is only drawn once. A
 * mixed pair genuinely needs two, and a shared load is one bar for the team.
 */
function barsFor(
  loadMode: string,
  people: Person[],
): { who: string | null; bar: number }[] {
  const wanted =
    loadMode === "SHARED"
      ? [{ who: null, bar: barFor(people[0]?.gender) }]
      : people.map((person) => ({
          who: person.name.split(" ")[0] as string | null,
          bar: barFor(person.gender),
        }));

  const distinct = new Set(wanted.map((entry) => entry.bar));
  return distinct.size <= 1
    ? [{ who: null, bar: wanted[0]?.bar ?? barFor(null) }]
    : wanted;
}

/**
 * How many of a thing a lane needs.
 *
 * A shared load is one between the team. Otherwise there is one each, and for
 * a kettlebell or a sandbag that means two to go and fetch — so they are shown
 * separately rather than collapsed into one.
 */
function piecesFor(loadMode: string, people: Person[]): (string | null)[] {
  if (loadMode === "SHARED" || people.length <= 1) return [null];
  return people.map((person) => person.name.split(" ")[0]);
}

export default async function HeatsPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  const { id, eventId } = await params;

  const [competition, event] = await Promise.all([
    db.competition.findUnique({
      where: { id },
      include: { events: { orderBy: [{ position: "asc" }, { name: "asc" }] } },
    }),
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
      <EventNav
        competitionId={competition.id}
        eventId={eventId}
        eventName={event.name}
        current="heats"
        showDraw={competition.mode === "SCRAMBLE"}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            {event.heats.length} heats ·{" "}
            {event.heats.length > 0
              ? Math.max(...event.heats.map((heat) => heat.lanes.length))
              : competition.lanesPerHeat}{" "}
            lanes
          </span>
          <h1 className="font-display text-[44px] font-bold uppercase leading-none">
            Heats for {event.name}
          </h1>
        </div>

        {event.heats.length > 0 && (
          <ContinueButton
            competitionId={competition.id}
            events={competition.events}
            eventId={eventId}
            step="heats"
            scrambles={competition.mode === "SCRAMBLE"}
          />
        )}

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

      {loaded.length > 0 ? null : (
        <p className="text-[14px] text-muted">
          This workout has no loads, so there is nothing to set up on the floor.
          Loads are added to each movement in the{" "}
          <Link
            href={`/competitions/${competition.id}/events`}
            className="font-semibold underline"
          >
            event builder
          </Link>
          .
        </p>
      )}

      {event.heats.length === 0 && (
        <p className="text-[15px] text-muted">
          No heats yet. Draw the teams first, then work out the heats here.
        </p>
      )}

      {event.heats.map((heat) => {
        // How many bars the busiest lane in this heat needs for each movement,
        // so the shorter lanes can be padded and everything lines up across.
        const rowsNeeded = new Map<string, number>();
        for (const lane of heat.lanes) {
          const people = lane.team
            ? lane.team.members.map((m) => m.athlete)
            : lane.athlete
              ? [lane.athlete]
              : [];
          for (const movement of loaded) {
            const rows =
              movement.implement === "BARBELL"
                ? barsFor(movement.loadMode, people).length
                : piecesFor(movement.loadMode, people).length;
            rowsNeeded.set(movement.id, Math.max(rowsNeeded.get(movement.id) ?? 1, rows));
          }
        }

        return (
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

                  {loaded.length === 0 && (
                    <span className="text-[13px] text-muted">
                      Nothing to load for this workout.
                    </span>
                  )}

                  {loaded.map((movement) => {
                    const kilos = readKilos(movement[category.field]);
                    if (kilos === null) return null;

                    // A shared load is one bar for the team. Otherwise each
                    // athlete has their own, and a mixed pair means two
                    // different bars for the same weight: 20 kg and 15 kg.
                    const bars = barsFor(movement.loadMode, people);
                    const pieces = piecesFor(movement.loadMode, people);
                    // One lane needing two bars must not push everything below
                    // it out of line with the lanes beside it.
                    const needed = rowsNeeded.get(movement.id) ?? 1;
                    const padding =
                      needed -
                      (movement.implement === "BARBELL" ? bars.length : pieces.length);

                    return (
                      <div key={movement.id} className="flex flex-col gap-1">
                        <span className="text-[13px] text-muted">
                          {movement.name} · {movement[category.field]}
                          {movement.loadMode === "SHARED" ? " · shared" : ""}
                        </span>
                        {movement.implement === "BARBELL" ? (
                          <div
                            className="grid items-center gap-x-2 gap-y-1"
                            // Name, bar, then what goes on each side. All the
                            // bars share the middle column, so however wide
                            // the widest one is, they all centre on it.
                            style={{ gridTemplateColumns: "auto auto auto", justifyContent: "start" }}
                          >
                            {bars.map((entry, index) => (
                              <Barbell
                                key={index}
                                who={entry.who}
                                loading={loadBar(kilos, entry.bar)}
                              />
                            ))}
                            {padding > 0 &&
                              Array.from({ length: padding }, (_, index) => (
                                <span
                                  key={`pad-${index}`}
                                  aria-hidden
                                  style={{ gridColumn: "1 / -1", height: 34 }}
                                />
                              ))}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {pieces.map((who, index) => (
                              <Implement
                                key={index}
                                kind={movement.implement}
                                kilos={kilos}
                                who={who}
                              />
                            ))}
                            {padding > 0 &&
                              Array.from({ length: padding }, (_, index) => (
                                <span key={`pad-${index}`} aria-hidden style={{ height: 26 }} />
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}

/**
 * Anything that is not a barbell: it weighs what it weighs.
 *
 * Each one is drawn as itself so the floor plan can be read at a glance —
 * a kettlebell and a sandbag are very different things to go and fetch.
 */
function Implement({
  kind,
  kilos,
  who,
}: {
  kind: string;
  kilos: number;
  /** Whose it is, when there is one each rather than one between them. */
  who: string | null;
}) {
  const label = kind.charAt(0) + kind.slice(1).toLowerCase();
  return (
    <span className="flex items-center gap-2">
      {who && <span className="w-12 shrink-0 truncate text-[12px] text-muted">{who}</span>}
      <ImplementShape kind={kind} />
      <span className="font-display num text-[13px] font-bold text-muted">
        {kilos} kg {label.toLowerCase()}
      </span>
    </span>
  );
}

function ImplementShape({ kind }: { kind: string }) {
  const ink = "#1B1B1B";

  if (kind === "KETTLEBELL") {
    return (
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        {/* Handle, then the bell hanging under it. */}
        <path
          d="M8.5 10V8a4.5 4.5 0 0 1 9 0v2"
          fill="none"
          stroke={ink}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path d="M13 9c5 0 8 4 8 9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3c0-5 3-9 8-9Z" fill={ink} />
      </svg>
    );
  }

  if (kind === "DUMBBELL") {
    return (
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        {/* A head at each end with a short handle between them. */}
        <rect x="2" y="7" width="5" height="12" rx="1.5" fill={ink} />
        <rect x="19" y="7" width="5" height="12" rx="1.5" fill={ink} />
        <rect x="7" y="11.5" width="12" height="3" fill={ink} />
      </svg>
    );
  }

  if (kind === "SANDBAG") {
    return (
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <rect x="2" y="8" width="22" height="12" rx="4" fill={ink} />
      </svg>
    );
  }

  // Anything else: a plain block, since we do not know what it is.
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <rect x="4" y="9" width="18" height="10" rx="2" fill={ink} opacity="0.55" />
    </svg>
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
      <span
        className="text-[13px] font-semibold"
        // Takes the whole row, since there is no bar to line up with.
        style={{ color: "#8A2A12", gridColumn: "1 / -1" }}
      >
        {loading.shortBy < 0
          ? `Lighter than the ${loading.bar} kg bar`
          : `Cannot be loaded — ${loading.shortBy} kg short`}
      </span>
    );
  }

  return (
    <>
      <span className="w-12 shrink-0 truncate text-[12px] text-muted">{who ?? ""}</span>

      <span className="flex flex-col items-center justify-self-center" title={`${loading.bar} kg bar`}>
        {/* The bar's own weight belongs over the bar, not beside the plates,
            where it read as though it were another plate. */}
        <span className="font-display num text-[11px] font-bold leading-none text-muted">
          {loading.bar}
        </span>
        {/* Tucked up close, so the weight reads as belonging to the bar
            rather than floating above the whole lane. */}
        <span
          className="-mt-[3px] flex items-center gap-[2px]"
          // Always as tall as the biggest plate, so the weight sits the same
          // distance above whether or not there are any plates on.
          style={{ height: 26 }}
        >
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

      <span className="font-display num justify-self-start whitespace-nowrap text-[13px] font-bold text-muted">
        {loading.perSide.length > 0 ? `${loading.perSide.join(" + ")} a side` : ""}
      </span>
    </>
  );
}

/** One plate, in the colour that weight is actually made in. */
function Plate({ kg }: { kg: number }) {
  const plate = PLATES.find((p) => p.kg === kg)!;
  return (
    <span
      className="shrink-0 rounded-[2px]"
      style={{
        background: plate.colour,
        width: plate.width * 0.55,
        height: plate.height * 0.4,
        // The black plate would disappear against the dark text otherwise.
        border: plate.kg === 5 ? "1px solid #555" : undefined,
      }}
    />
  );
}
