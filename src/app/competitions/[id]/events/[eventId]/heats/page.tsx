import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { generateHeats } from "@/lib/actions";
import { teamClass, classLabel } from "@/lib/team-class";
import { loadBar, readKilos, PLATES } from "@/lib/plates";
import { teamCategory, laneLoads, stationCount, type LaneLoad } from "@/lib/heats";
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

  // Fixed teams keep a version of the workout per division. Until this screen
  // shows each lane its own division's version, it shows the first
  // division's, as it did before versions existed.
  const firstDivision =
    (await db.division.findFirst({ where: { competitionId: competition.id }, orderBy: { position: "asc" } }))
      ?.id ?? null;
  event.movements = event.movements.filter(
    (movement) => (movement.block.divisionId ?? firstDivision) === firstDivision,
  );
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
  const loaded = event.movements.filter(
    (movement) =>
      movement.implement !== "OTHER" ||
      movement.loadMenMen !== null ||
      movement.loadWomenWomen !== null ||
      movement.loadMixed !== null ||
      movement.loadSixtyPlus !== null,
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
              laneLoads(movement, people).length ||
              stationCount(movement.implement, people);
            rowsNeeded.set(movement.id, Math.max(rowsNeeded.get(movement.id) ?? 1, rows));
          }
        }

        return (
        <div key={heat.id} className="flex flex-col gap-3 rounded-xl border border-line bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-baseline gap-3">
              <span className="font-display text-[26px] font-bold uppercase">
                Heat {heat.number}
              </span>
              {/* Fixed teams only race their own division and class. */}
              {competition.mode === "FIXED_TEAM" && heat.lanes[0]?.team && (
                <span className="text-[15px] font-semibold text-muted">
                  {[
                    heat.lanes[0].team.division?.name,
                    classLabel(teamClass(heat.lanes[0].team.members.map((m) => m.athlete.gender))),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </span>
            {/* Start times are off the screens for now (Carin, 23 September
                2026). Any already typed are kept, in Heat.startsAt. */}
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
                    // What this lane actually sets out. A pair with no load of
                    // their own between them lift their own weights, so the
                    // two rows can differ.
                    const rows = laneLoads(movement, people);
                    // Nothing to weigh out, but there is still something to
                    // put in the lane: a rower, a rig, a rope each.
                    const bare = rows.length === 0 ? stationCount(movement.implement, people) : 0;
                    if (rows.length === 0 && movement.implement === "OTHER") return null;

                    // A bar is only drawn when the weight could go on one:
                    // `implement` defaults to barbell, so a 6 kg wall ball
                    // would otherwise arrive claiming to be one.
                    const onBars =
                      movement.implement === "BARBELL" &&
                      rows.every((row) => (readKilos(row.load) ?? 0) >= row.bar);

                    // One lane needing two bars must not push everything below
                    // it out of line with the lanes beside it.
                    const padding =
                      (rowsNeeded.get(movement.id) ?? 1) - (rows.length || bare);

                    return (
                      <div key={movement.id} className="flex flex-col gap-1">
                        <span className="text-[13px] text-muted">
                          {movement.name}
                          {movement.loadMode === "SHARED" ? " · shared" : ""}
                        </span>
                        {onBars ? (
                          <div
                            className="grid items-center gap-x-2 gap-y-1"
                            // Name, bar, then what goes on each side. All the
                            // bars share the middle column, so however wide
                            // the widest one is, they all centre on it.
                            style={{ gridTemplateColumns: "auto auto auto", justifyContent: "start" }}
                          >
                            {rows.map((row, index) => (
                              <Barbell
                                key={index}
                                who={row.who}
                                loading={loadBar(readKilos(row.load) ?? 0, row.bar)}
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
                            {rows.map((row, index) => (
                              <Implement
                                key={index}
                                kind={
                                  movement.implement === "BARBELL" ? "OTHER" : movement.implement
                                }
                                row={row}
                              />
                            ))}
                            {Array.from({ length: bare }, (_, index) => (
                              <Implement key={`bare-${index}`} kind={movement.implement} />
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
