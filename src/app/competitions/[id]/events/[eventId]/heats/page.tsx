import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { generateHeats } from "@/lib/actions";
import { teamClass, classLabel } from "@/lib/team-class";
import { loadBar, readKilos, PLATES } from "@/lib/plates";
import { teamCategory, laneLoads, stationCount, type LaneLoad, type MovementLoads } from "@/lib/heats";
import { ImplementShape, IMPLEMENTS } from "@/components/implement";
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

export default async function HeatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ heat?: string }>;
}) {
  const { id, eventId } = await params;
  const { heat: wantedHeat } = await searchParams;

  const [competition, event] = await Promise.all([
    db.competition.findUnique({
      where: { id },
      include: { events: { orderBy: [{ position: "asc" }, { name: "asc" }] } },
    }),
    db.event.findUnique({
      where: { id: eventId },
      include: {
        movements: { orderBy: { position: "asc" }, include: { block: { select: { divisionId: true } } } },
        heats: {
          orderBy: { number: "asc" },
          include: {
            lanes: {
              orderBy: { number: "asc" },
              include: {
                athlete: true,
                team: { include: { members: { include: { athlete: true } }, division: true } },
              },
            },
          },
        },
      },
    }),
  ]);
  if (!competition || !event || event.competitionId !== competition.id) notFound();

  // Fixed teams keep a version of the workout per division, and a heat only
  // ever holds one division, so each heat is set up from its own version: a
  // Scaled heat fetches Scaled loads. Everyone else has the one version.
  const firstDivision =
    (await db.division.findFirst({ where: { competitionId: competition.id }, orderBy: { position: "asc" } }))
      ?.id ?? null;
  const fixed = competition.mode === "FIXED_TEAM";
  const divisionOfHeat = (heat: (typeof event.heats)[number]) =>
    fixed ? (heat.lanes.find((lane) => lane.team)?.team?.divisionId ?? null) : null;
  // Fixed teams have no 60+ class: nobody gets a 60+ load or badge there.
  if (competition.mode === "FIXED_TEAM") {
    for (const heat of event.heats) {
      for (const lane of heat.lanes) {
        for (const member of lane.team?.members ?? []) member.athlete.isSixtyPlus = false;
      }
    }
  }

  // Everything a lane has to have something put in it for. That is not only
  // the movements with a weight: a lane still needs a rower in it, and a box
  // jump's "60 cm" is a box to fetch even though it is not a load.
  const loadedFor = (divisionId: string | null) =>
    event.movements.filter(
      (movement) =>
        (movement.block.divisionId ?? firstDivision) === (divisionId ?? firstDivision) &&
        (movement.implement !== "OTHER" ||
          movement.loadMenMen !== null ||
          movement.loadWomenWomen !== null ||
          movement.loadMixed !== null ||
          movement.loadSixtyPlus !== null),
    );
  // For the note below: does any version have anything to set up?
  const anythingLoaded = event.movements.some(
    (movement) =>
      movement.implement !== "OTHER" ||
      movement.loadMenMen !== null ||
      movement.loadWomenWomen !== null ||
      movement.loadMixed !== null ||
      movement.loadSixtyPlus !== null,
  );

  const selected =
    event.heats.find((heat) => heat.number === Number(wantedHeat)) ?? event.heats[0];
  // Fixed teams: which division and class a heat is for, "RX · W/W".
  const groupOf = (heat: (typeof event.heats)[number]) => {
    const team = heat.lanes.find((lane) => lane.team)?.team;
    if (competition.mode !== "FIXED_TEAM" || !team) return null;
    return [team.division?.name, classLabel(teamClass(team.members.map((m) => m.athlete.gender)))]
      .filter(Boolean)
      .join(" · ");
  };

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
            {event.name}
          </span>
          <h1 className="font-display text-[44px] font-bold uppercase leading-none">
            Heats &amp; lanes
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
        {selected && (
          <Link
            href={`/competitions/${competition.id}/screen/workout?event=${eventId}&heat=${selected.number}`}
            className="flex h-12 items-center rounded-lg border border-line bg-card px-5 font-semibold"
          >
            Show on big screen
          </Link>
        )}

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

      {anythingLoaded ? null : (
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

      {/* One card per heat; the floor plan below is the one picked. */}
      {event.heats.length > 0 && (
        <nav aria-label="Heats" className="flex flex-wrap gap-2.5">
          {event.heats.map((heat) => {
            const chosen = heat.id === selected?.id;
            return (
              <Link
                key={heat.id}
                href={`?heat=${heat.number}`}
                aria-current={chosen ? "page" : undefined}
                className="flex min-w-[200px] flex-col rounded-[10px] bg-card px-4 py-3"
                style={{ border: `2px solid ${chosen ? "var(--ink)" : "var(--line)"}` }}
              >
                <span className="text-[16px] font-semibold">Heat {heat.number}</span>
                <span className="text-[13px] font-semibold" style={{ color: "var(--brand-secondary)" }}>
                  {groupOf(heat) ?? `${heat.lanes.length} ${heat.lanes.length === 1 ? "lane" : "lanes"}`}
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      {selected && <FloorPlan heat={selected} loaded={loadedFor(divisionOfHeat(selected))} />}
    </div>
  );
}

type FloorPerson = { name: string; gender: string | null; isSixtyPlus: boolean };
type FloorLane = {
  id: string;
  number: number;
  athlete: FloorPerson | null;
  team: { members: { athlete: FloorPerson }[] } | null;
};
type FloorMovement = MovementLoads & { id: string };

const equipmentLabel = (implement: string) =>
  IMPLEMENTS.find((option) => option.id === implement)?.label ?? implement;

/**
 * One heat laid out as the floor, from Heats.dc.html: the start and finish
 * line where the judges stand, the lanes side by side below it, and in each
 * lane what goes where — room kept clear for work that needs no weight, the
 * loaded bars, anything else to fetch. Underneath, everything to bring out
 * for the heat, added up.
 */
function FloorPlan({ heat, loaded }: { heat: { number: number; lanes: FloorLane[] }; loaded: FloorMovement[] }) {
  const peopleOf = (lane: FloorLane) =>
    lane.team ? lane.team.members.map((m) => m.athlete) : lane.athlete ? [lane.athlete] : [];

  // How much room each movement needs in the busiest lane, so the lanes line
  // up across the floor however many bars one of them has.
  const rowsNeeded = new Map<string, number>();
  // Everything to bring out: plates by weight, bars by weight, other kit.
  const plates = new Map<number, number>();
  const bars = new Map<number, number>();
  const kit = new Map<string, number>();
  const add = <K,>(map: Map<K, number>, key: K, by: number) => map.set(key, (map.get(key) ?? 0) + by);

  for (const lane of heat.lanes) {
    const people = peopleOf(lane);
    for (const movement of loaded) {
      const rows = laneLoads(movement, people);
      const onBars =
        movement.implement === "BARBELL" &&
        rows.length > 0 &&
        rows.every((row) => (readKilos(row.load) ?? 0) >= row.bar);
      const bare = rows.length === 0 && movement.implement !== "OTHER" ? stationCount(movement.implement, people) : 0;
      rowsNeeded.set(movement.id, Math.max(rowsNeeded.get(movement.id) ?? 1, rows.length || bare || 1));

      if (onBars) {
        for (const row of rows) {
          const loading = loadBar(readKilos(row.load) ?? 0, row.bar);
          add(bars, row.bar, 1);
          for (const kg of loading.perSide) add(plates, kg, 2);
        }
      } else if (rows.length > 0) {
        const label = movement.implement === "BARBELL" || movement.implement === "OTHER" ? movement.name : equipmentLabel(movement.implement);
        for (const row of rows) add(kit, `${label} ${row.load}`, 1);
      } else if (bare > 0) {
        add(kit, equipmentLabel(movement.implement), bare);
      }
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-display text-[24px] font-bold uppercase">Floor plan · heat {heat.number}</span>
        <div className="flex flex-wrap items-center gap-3.5">
          {PLATES.map((plate) => (
            <span key={plate.kg} className="flex items-center gap-1.5">
              <span className="h-[22px] w-3 rounded-sm border border-black/25" style={{ background: plate.colour }} />
              <span className="num text-[13px] font-semibold">{plate.kg}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 rounded-[14px] bg-[#E4DED1] px-4 pb-[18px] pt-3.5">
        <div className="flex items-center gap-2.5">
          <span className="h-[3px] grow bg-ink" />
          <span className="text-[12px] font-bold uppercase tracking-[.08em]">
            Start / finish line · judges stand here
          </span>
          <span className="h-[3px] grow bg-ink" />
        </div>

        <div className="grid" style={{ gridTemplateColumns: `repeat(${heat.lanes.length}, minmax(0, 1fr))` }}>
          {heat.lanes.map((lane, laneIndex) => {
            const people = peopleOf(lane);
            const category = teamCategory(people.map((p) => p.gender), people.some((p) => p.isSixtyPlus));
            return (
              <div
                key={lane.id}
                className="flex min-w-0 flex-col gap-2.5 px-3.5"
                style={{ borderLeft: laneIndex > 0 ? "2px dashed #A39D8F" : undefined }}
              >
                <div className="flex h-[52px] items-center gap-2.5 rounded-[10px] bg-card px-2.5">
                  <span className="font-display num flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink text-[22px] font-bold text-white">
                    {lane.number}
                  </span>
                  <span className="min-w-0 grow truncate text-[16px] font-semibold">
                    {people.map((p) => p.name).join(" & ") || "Empty"}
                  </span>
                  <span className="shrink-0 rounded-md bg-paper px-2 py-1 text-[12px] font-bold text-muted">
                    {category.label}
                  </span>
                </div>

                {loaded.map((movement) => {
                  const rows = laneLoads(movement, people);
                  const bare = rows.length === 0 && movement.implement !== "OTHER" ? stationCount(movement.implement, people) : 0;
                  if (rows.length === 0 && bare === 0) return null;
                  const onBars =
                    movement.implement === "BARBELL" && rows.every((row) => (readKilos(row.load) ?? 0) >= row.bar);
                  const padding = (rowsNeeded.get(movement.id) ?? 1) - (rows.length || bare);

                  // Nothing heavy, just room to work: a rope, a rower.
                  if (bare > 0) {
                    return (
                      <div
                        key={movement.id}
                        className="flex flex-col items-center justify-center gap-0.5 rounded-[10px] border-2 border-dashed border-[#A39D8F] px-2 py-3 text-center"
                      >
                        <span className="text-[12px] font-bold uppercase tracking-[.06em] text-muted">Keep clear</span>
                        <span className="text-[14px] font-semibold">
                          {movement.name} · {bare} × {equipmentLabel(movement.implement).toLowerCase()}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div key={movement.id} className="flex flex-col gap-1.5 rounded-[10px] bg-white/55 px-2.5 py-2">
                      <span className="text-[12px] text-muted">
                        {movement.name}
                        {movement.loadMode === "SHARED" ? " · shared" : ""}
                      </span>
                      {onBars ? (
                        <div className="grid items-center gap-x-2 gap-y-1" style={{ gridTemplateColumns: "auto auto auto", justifyContent: "start" }}>
                          {rows.map((row, index) => (
                            <Barbell key={index} who={row.who} loading={loadBar(readKilos(row.load) ?? 0, row.bar)} />
                          ))}
                        </div>
                      ) : (
                        rows.map((row, index) => (
                          <Implement key={index} kind={movement.implement === "BARBELL" ? "OTHER" : movement.implement} row={row} />
                        ))
                      )}
                      {padding > 0 &&
                        Array.from({ length: padding }, (_, index) => (
                          <span key={`pad-${index}`} aria-hidden style={{ height: onBars ? 34 : 26 }} />
                        ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-xl border border-line bg-card px-5 py-3.5">
        <span className="w-[110px] text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
          Bring out for this heat
        </span>
        {[...bars.entries()].sort((a, b) => b[0] - a[0]).map(([bar, count]) => (
          <span key={`bar-${bar}`} className="flex flex-col">
            <span className="font-display num text-[24px] font-bold leading-none">{count}</span>
            <span className="text-[12px] text-muted">{bar} kg bar{count === 1 ? "" : "s"}</span>
          </span>
        ))}
        {PLATES.filter((plate) => plates.has(plate.kg)).map((plate) => (
          <span key={plate.kg} className="flex items-center gap-2">
            <span className="h-[26px] w-3 rounded-sm border border-black/25" style={{ background: plate.colour }} />
            <span className="flex flex-col">
              <span className="font-display num text-[24px] font-bold leading-none">{plates.get(plate.kg)}</span>
              <span className="text-[12px] text-muted">× {plate.kg} kg</span>
            </span>
          </span>
        ))}
        {[...kit.entries()].map(([item, count]) => (
          <span key={item} className="flex flex-col">
            <span className="font-display num text-[24px] font-bold leading-none">{count}</span>
            <span className="text-[12px] text-muted">{item}</span>
          </span>
        ))}
        {bars.size + plates.size + kit.size === 0 && (
          <span className="text-[14px] text-muted">Nothing to bring out for this workout.</span>
        )}
      </div>
    </section>
  );
}

/**
 * Anything that is not a barbell: it weighs what it weighs.
 *
 * Each one is drawn as itself so the floor plan can be read at a glance —
 * a kettlebell and a sandbag are very different things to go and fetch.
 */
function Implement({ kind, row }: { kind: string; row?: LaneLoad }) {
  const label = IMPLEMENTS.find((option) => option.id === kind)?.label ?? "";
  return (
    <span className="flex items-center gap-2">
      {/* Whose it is, when there is one each rather than one between them. */}
      <span className="w-12 shrink-0 truncate text-[12px] text-muted">{row?.who ?? ""}</span>
      <span className="text-ink">
        <ImplementShape kind={kind} />
      </span>
      <span className="font-display num text-[13px] font-bold text-muted">
        {/* With no weight to state, say what the thing is instead. */}
        {row ? row.load : label}
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
        {/* The total belongs on the row now that a pair's two bars can be set
            to different weights. */}
        {total(loading)} kg
        {loading.perSide.length > 0 ? ` · ${loading.perSide.join(" + ")} a side` : ""}
      </span>
    </>
  );
}

/** What a loading adds up to: the bar plus both sides. */
function total(loading: ReturnType<typeof loadBar>): number {
  return loading.bar + loading.perSide.reduce((sum, plate) => sum + plate, 0) * 2;
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
