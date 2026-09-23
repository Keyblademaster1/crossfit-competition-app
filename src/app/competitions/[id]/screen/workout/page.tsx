import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadTheme } from "@/lib/theme";
import { loadBar, readKilos, PLATES, WOMENS_BAR, type Loading } from "@/lib/plates";
import {
  teamCategory,
  laneLoads,
  currentHeat,
  sharedLoad,
  loadColumns,
  type LaneLoad,
  type Person,
} from "@/lib/heats";
import { ImplementShape, implementNoun, IMPLEMENTS } from "@/components/implement";

import { HeatClock } from "@/components/heat-clock";

/**
 * The workout screen, from WorkoutScreen.dc.html.
 *
 * The second big screen: the workout on the left, the lanes of one heat on the
 * right, and the clock across the top. It is read from the far side of the
 * gym by people who are mid-workout, so nothing on it is small and nothing
 * scrolls — anything that does not fit is shrunk until it does, see `fit`.
 *
 * As on the leaderboard, every measurement is a multiple of `--u`, one 1920th
 * of the screen width, so the whole thing scales to whatever it is plugged
 * into and still matches the design on a 1080p screen.
 */

export const dynamic = "force-dynamic";

/** Sizes in the design's own pixels. `--u` is one of them. */
const u = (n: number) => `calc(${n} * var(--u))`;
/** The workout panel's unit: `--u`, shrunk if the workout is a long one. */
const wu = (n: number) => `calc(${n} * var(--wu))`;
/** A lane's unit: `--u`, shrunk if the lanes have a lot to hold. */
const lu = (n: number) => `calc(${n} * var(--lu))`;

/** Background and ink for each sort of pair, sampled from the design. */
const CATEGORY_COLOURS: Record<string, [string, string]> = {
  "M/M": ["#DCE4D2", "#2E3D1F"],
  "W/W": ["#EEDFD2", "#5A3620"],
  Mixed: ["#E4E0D6", "#231F20"],
  "60+": ["#F2C230", "#231F20"],
};

/**
 * How tall each piece of a lane is, in design pixels, and how much room there
 * is for them between the header and the footer.
 *
 * These are measured off the design rather than off the page, because the page
 * has to know whether everything fits *before* it is drawn. They only have to
 * be close: being a few pixels out changes how much a long workout shrinks by,
 * not whether it fits.
 */
const BODY_HEIGHT = 806;

const LANE_HEADER = 100;
const LANE_GAP = 12;
/** A movement with nothing to load: the reps and the name in a dashed box. */
const PLAIN_BLOCK = 84;
/** One loaded bar, drawn. */
const BAR_BLOCK = 198;
/** One kettlebell, sandbag or dumbbell. */
const PIECE_BLOCK = 93;

/** The workout panel's own padding, top and bottom together. */
const PANEL_PADDING = 52;
/** Its heading, plus the first line of the sentence under it. */
const PANEL_TITLE = 78;
/** Every further line that sentence wraps onto. */
const PANEL_TITLE_LINE = 25;
const PANEL_GAP = 18;
/** One movement: the reps and the name. */
const PANEL_MOVEMENT = 83;
/** What the row of loads under it adds. */
const PANEL_LOADS = 119;
/** The 60+ note at the bottom, which runs to three lines. */
const PANEL_NOTE = 67;
/** Characters that fit on one line of the panel, near enough. */
const PANEL_LINE_LENGTH = 58;

/**
 * How much a column has to shrink to fit the screen.
 *
 * Never more than 1: a short workout is drawn at the size the design says,
 * not blown up to fill the height. The hair of slack keeps a rounding error
 * from being the thing that clips the bottom of a lane.
 */
function fit(wanted: number): number {
  return Math.min(1, (BODY_HEIGHT * 0.98) / Math.max(wanted, 1));
}

export default async function WorkoutScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ event?: string; heat?: string }>;
}) {
  const { id } = await params;
  const { event: wantedEvent, heat: wantedHeat } = await searchParams;

  const competition = await db.competition.findUnique({
    where: { id },
    include: {
      athletes: { select: { name: true } },
      events: {
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: {
          scores: { select: { athleteId: true, teamId: true } },
          heats: {
            orderBy: { number: "asc" },
            include: {
              lanes: {
                select: {
                  teamId: true,
                  athleteId: true,
                  team: { select: { members: { select: { athleteId: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!competition) notFound();

  // Which heat the screen should be sitting on if nobody has said otherwise.
  const progress = competition.events.map((event) => {
    const scoredAthletes = new Set(
      event.scores.map((score) => score.athleteId).filter(Boolean),
    );
    const scoredTeams = new Set(event.scores.map((score) => score.teamId).filter(Boolean));
    return {
      id: event.id,
      heats: event.heats.map((heat) => ({
        number: heat.number,
        done: heat.lanes.every((lane) => {
          if (lane.teamId && scoredTeams.has(lane.teamId)) return true;
          if (lane.athleteId && scoredAthletes.has(lane.athleteId)) return true;
          // In a scramble the points belong to the athletes rather than the
          // team they were drawn into, so the result is filed under each.
          return lane.team?.members.some((m) => scoredAthletes.has(m.athleteId)) ?? false;
        }),
      })),
    };
  });
  const here = currentHeat(progress);

  const chosenId =
    competition.events.find((event) => event.id === wantedEvent)?.id ??
    here?.eventId ??
    competition.events[0]?.id;

  if (!chosenId) return <Nothing competitionId={id}>This competition has no events yet.</Nothing>;

  const event = await db.event.findUnique({
    where: { id: chosenId },
    include: {
      movements: { orderBy: { position: "asc" }, include: { block: { select: { divisionId: true } } } },
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
  });
  if (!event || event.competitionId !== competition.id) notFound();

  const divisions = await db.division.findMany({
    where: { competitionId: competition.id },
    orderBy: { position: "asc" },
  });
  const firstDivision = divisions[0]?.id ?? null;
  // Fixed teams have no 60+ class: nobody gets a 60+ load or badge there.
  if (competition.mode === "FIXED_TEAM") {
    for (const heat of event.heats) {
      for (const lane of heat.lanes) {
        for (const member of lane.team?.members ?? []) member.athlete.isSixtyPlus = false;
      }
    }
  }

  if (event.heats.length === 0) {
    return (
      <Nothing competitionId={id}>
        {event.name} has no heats yet. Draw the teams and set out the heats, and
        this screen fills itself in.
      </Nothing>
    );
  }

  const asked = Number(wantedHeat);
  const heat =
    event.heats.find((h) => h.number === asked) ??
    (chosenId === here?.eventId
      ? event.heats.find((h) => h.number === here.heatNumber)
      : undefined) ??
    event.heats[0];

  // Fixed teams keep a version of the workout per division, and a heat only
  // ever holds one division, so the screen shows that heat's version: a
  // Scaled heat reads Scaled movements and loads. Everyone else: one version.
  const heatDivisionId =
    competition.mode === "FIXED_TEAM"
      ? (heat.lanes.find((lane) => lane.team)?.team?.divisionId ?? null)
      : null;
  const heatDivision = divisions.find((division) => division.id === heatDivisionId);
  event.movements = event.movements.filter(
    (movement) => (movement.block.divisionId ?? firstDivision) === (heatDivisionId ?? firstDivision),
  );

  const theme = loadTheme();
  const shorten = shortNames(competition.athletes.map((athlete) => athlete.name));

  // The lanes only say what to put out and where: the workout itself is on
  // the left (Carin, 23 September 2026). So a movement that needs nothing on
  // the floor — push-ups, air squats — gets no line in a lane.
  const floor = event.movements.filter(
    (movement) =>
      movement.implement !== "OTHER" ||
      movement.loadMenMen !== null ||
      movement.loadWomenWomen !== null ||
      movement.loadMixed !== null ||
      movement.loadSixtyPlus !== null,
  );

  // Everything each lane needs on the floor, movement by movement.
  const lanes = heat.lanes.map((lane) => {
    const people = lane.team
      ? lane.team.members.map((member) => member.athlete)
      : lane.athlete
        ? [lane.athlete]
        : [];
    const category = teamCategory(
      people.map((person) => person.gender),
      people.some((person) => person.isSixtyPlus),
    );
    return {
      id: lane.id,
      number: lane.number,
      who: people.map((person) => shorten(person.name)).join(" & ") || "Empty lane",
      category,
      blocks: floor.map((movement) => planBlock(movement, people)),
    };
  });

  // A movement takes the same height in every lane, so the three columns stay
  // in step: a mixed pair needing two bars must not push the lane beside it
  // out of line. The tallest lane decides, and the shorter ones leave a gap.
  const movementHeights = floor.map((_, index) =>
    Math.max(
      ...lanes.map((lane) => {
        const block = lane.blocks[index];
        return block.rows * blockHeight(block.kind) + (block.rows - 1) * LANE_GAP;
      }),
      PLAIN_BLOCK,
    ),
  );

  const laneScale = fit(
    LANE_HEADER + movementHeights.reduce((total, height) => total + height + LANE_GAP, 0),
  );

  const teamSize = competition.mode === "INDIVIDUAL" ? 1 : (competition.teamSize ?? 2);
  const subtitle = subtitleFor(teamSize, event.timeCapSeconds);

  const panelScale = fit(
    PANEL_PADDING +
      PANEL_TITLE +
      PANEL_TITLE_LINE *
        (Math.max(1, Math.ceil(subtitle.length / PANEL_LINE_LENGTH)) - 1) +
      event.movements.reduce(
        (total, movement) =>
          total + PANEL_GAP + PANEL_MOVEMENT + (chipsFor(movement).length > 0 ? PANEL_LOADS : 0),
        0,
      ) +
      (event.movements.some((movement) => movement.loadSixtyPlus)
        ? PANEL_GAP + PANEL_NOTE
        : 0),
  );

  const place = progress.find((p) => p.id === event.id);
  const standing = place?.heats.find((h) => h.number === heat.number)?.done
    ? "already run"
    : here?.eventId === event.id && here.heatNumber === heat.number
      ? "on the floor now"
      : "coming up";

  const index = competition.events.findIndex((e) => e.id === event.id);
  const after = event.heats.find((h) => h.number > heat.number);
  const nextUp = after
    ? `Next: heat ${after.number} · ${after.lanes
        .map((lane) =>
          lane.team
            ? lane.team.members.map((m) => shorten(m.athlete.name)).join(" & ")
            : lane.athlete
              ? shorten(lane.athlete.name)
              : "empty",
        )
        .join(", ")}`
    : competition.events[index + 1]
      ? `Next: ${competition.events[index + 1].name}`
      : "Last heat of the competition";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{
        // One unit is a 1920th of the board, and the board keeps the shape it
        // was designed in. Taking the smaller of the two fits it to a window
        // of any proportion: on a 16:9 TV it fills the screen exactly, and
        // anywhere else it sits in the middle rather than being cut off.
        ["--u" as string]: "min(100vw / 1920, 100vh / 1080)",
        background: "var(--brand-screen-bg)",
      }}
    >
    <div
      className="flex flex-col overflow-hidden font-sans"
      style={{
        ["--wu" as string]: `calc(${panelScale} * var(--u))`,
        ["--reps" as string]: lightened(theme.primary),
        ["--lu" as string]: `calc(${laneScale} * var(--u))`,
        width: u(1920),
        height: u(1080),
        color: "#fff",
        padding: `${u(40)} ${u(56)}`,
        gap: u(24),
      }}
    >
      <header className="flex items-center justify-between" style={{ gap: u(24) }}>
        <div className="flex min-w-0 items-center" style={{ gap: u(28) }}>
          {theme.logoDark ? (
            <Image
              src={theme.logoDark}
              alt={theme.name}
              width={280}
              height={84}
              unoptimized
              style={{ height: u(84), width: "auto" }}
            />
          ) : (
            <span
              aria-hidden
              style={{
                width: u(12),
                height: u(84),
                background: "var(--brand-primary)",
                borderRadius: u(4),
              }}
            />
          )}
          <span
            aria-hidden
            style={{ width: u(2), height: u(64), background: "rgba(255,255,255,.2)" }}
          />
          <div className="flex min-w-0 flex-col" style={{ gap: u(6) }}>
            <span
              className="font-semibold uppercase"
              style={{
                fontSize: u(20),
                color: "var(--color-screen-muted)",
                letterSpacing: ".06em",
              }}
            >
              Heat {heat.number} of {event.heats.length}
              {heatDivision ? ` · ${heatDivision.name}` : ""} · {standing}
            </span>
            <span
              className="truncate font-stencil uppercase leading-none"
              style={{ fontSize: u(56) }}
            >
              {event.name}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center" style={{ gap: u(20) }}>
          {event.heats.length > 1 && (
            <div
              className="flex"
              style={{
                background: "rgba(255,255,255,.08)",
                borderRadius: u(10),
                padding: u(4),
                gap: u(4),
              }}
            >
              {event.heats.map((option) => (
                <Link
                  key={option.id}
                  href={`?event=${event.id}&heat=${option.number}`}
                  className="flex items-center font-semibold"
                  style={{
                    height: u(44),
                    padding: `0 ${u(16)}`,
                    borderRadius: u(8),
                    fontSize: u(16),
                    background: option.number === heat.number ? "#fff" : "transparent",
                    color: option.number === heat.number ? "#231f20" : "#fff",
                  }}
                >
                  Heat {option.number}
                </Link>
              ))}
            </div>
          )}

          <HeatClock key={heat.id} timeCapSeconds={event.timeCapSeconds} />
        </div>
      </header>

      <div className="flex min-h-0 grow" style={{ gap: u(28) }}>
        <Workout event={event} subtitle={subtitle} teamSize={teamSize} />

        <section
          className="grid min-w-0 grow"
          style={{
            gridTemplateColumns: `repeat(${Math.max(lanes.length, 1)}, minmax(0, 1fr))`,
            gap: u(18),
          }}
        >
          {lanes.map((lane) => (
            <div key={lane.id} className="flex min-w-0 flex-col" style={{ gap: lu(LANE_GAP) }}>
              <div
                className="flex items-center"
                style={{
                  gap: lu(14),
                  padding: `${lu(14)} ${lu(16)}`,
                  borderRadius: lu(14),
                  background: "#fff",
                  color: "#231f20",
                }}
              >
                <span
                  className="font-display num flex shrink-0 items-center justify-center font-bold"
                  style={{
                    width: lu(64),
                    height: lu(64),
                    borderRadius: lu(10),
                    background: "#231f20",
                    color: "#fff",
                    fontSize: lu(42),
                  }}
                >
                  {lane.number}
                </span>
                <div className="flex min-w-0 flex-col" style={{ gap: lu(4) }}>
                  <span className="truncate font-bold" style={{ fontSize: lu(26) }}>
                    {lane.who}
                  </span>
                  <span
                    className="self-start font-bold"
                    style={{
                      fontSize: lu(15),
                      padding: `${lu(3)} ${lu(8)}`,
                      borderRadius: lu(6),
                      background: CATEGORY_COLOURS[lane.category.label]?.[0] ?? "#E4E0D6",
                      color: CATEGORY_COLOURS[lane.category.label]?.[1] ?? "#231f20",
                    }}
                  >
                    {lane.category.label === "60+" ? "60+ team" : lane.category.label}
                  </span>
                </div>
              </div>

              {floor.length === 0 && (
                <span style={{ fontSize: lu(18), color: "var(--color-screen-muted)" }}>
                  Nothing to set out for this workout.
                </span>
              )}
              {floor.map((movement, index) => (
                <div
                  key={movement.id}
                  className="flex flex-col justify-center"
                  // Every lane gives this movement the same room, so the rows
                  // read straight across the floor plan. A lane needing fewer
                  // bars than its neighbour centres in the space rather than
                  // leaving a hole underneath.
                  style={{ gap: lu(LANE_GAP), minHeight: lu(movementHeights[index]) }}
                >
                  <Block movement={movement} block={lane.blocks[index]} />
                </div>
              ))}
            </div>
          ))}
        </section>
      </div>

      <footer
        className="flex items-center justify-between"
        style={{ gap: u(24), fontSize: u(18), color: "var(--color-screen-muted)" }}
      >
        <div className="flex shrink-0 items-center" style={{ gap: u(16) }}>
          {PLATES.map((plate) => (
            <span key={plate.kg} className="flex items-center" style={{ gap: u(6) }}>
              <span
                aria-hidden
                style={{
                  width: u(12),
                  height: u(24),
                  borderRadius: u(2),
                  background: plate.colour,
                  border: `1px solid rgba(255,255,255,${plate.kg === 5 ? 0.75 : 0.4})`,
                }}
              />
              <span className="num font-semibold" style={{ fontSize: u(16) }}>
                {plate.kg} kg
              </span>
            </span>
          ))}
        </div>

        <span className="flex min-w-0 items-center" style={{ gap: u(16) }}>
          <span className="truncate">{nextUp}</span>
          <Link href={`/competitions/${id}`} className="shrink-0 underline">
            setup
          </Link>
        </span>
      </footer>
    </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

interface MovementRow {
  id: string;
  name: string;
  reps: number;
  loadMode: string;
  implement: string;
  loadMenMen: string | null;
  loadWomenWomen: string | null;
  loadMixed: string | null;
  loadSixtyPlus: string | null;
}

/** What one lane does for one movement: nothing to load, bars, or pieces. */
type LaneBlock =
  | { kind: "plain"; rows: 1; load: string | null }
  | { kind: "bars"; rows: number; loads: LaneLoad[] }
  | { kind: "pieces"; rows: number; loads: LaneLoad[] };

function planBlock(movement: MovementRow, people: Person[]): LaneBlock {
  const loads = laneLoads(movement, people);
  if (loads.length === 0) return { kind: "plain", rows: 1, load: null };

  // Only draw a bar when the weight could go on one. `implement` defaults to
  // BARBELL, so a movement nobody set it on turns up here claiming to be a
  // barbell: a 6 kg wall ball is a thing to pick up, not a bar to load.
  if (
    movement.implement === "BARBELL" &&
    loads.every((entry) => (readKilos(entry.load) ?? 0) >= entry.bar)
  ) {
    return { kind: "bars", rows: loads.length, loads };
  }

  // A load that is not a weight at all — a box jump is "60 cm" — has nothing
  // to weigh out, so it goes on the line with the movement itself.
  if (loads.every((entry) => readKilos(entry.load) === null)) {
    return { kind: "plain", rows: 1, load: loads[0].load };
  }

  return { kind: "pieces", rows: loads.length, loads };
}

/**
 * What a lane line calls the thing to put out: "Kettlebell", "Pull-up bar".
 * A movement with a load but no equipment chosen keeps its own name, since
 * nothing else says what the "60 cm" is for.
 */
function equipmentName(movement: MovementRow): string {
  const kind = symbolFor(movement);
  return kind === "OTHER"
    ? movement.name
    : (IMPLEMENTS.find((option) => option.id === kind)?.label ?? movement.name);
}

function blockHeight(kind: LaneBlock["kind"]): number {
  return kind === "bars" ? BAR_BLOCK : kind === "pieces" ? PIECE_BLOCK : PLAIN_BLOCK;
}

function Block({ movement, block }: { movement: MovementRow; block: LaneBlock }) {
  if (block.kind === "plain") {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          height: lu(PLAIN_BLOCK),
          border: `${lu(2)} dashed rgba(255,255,255,.35)`,
          borderRadius: lu(12),
          gap: lu(12),
        }}
      >
        {/* What to put in the lane, not the movement: the workout is on the
            left. A rower still has to be there with no weight to go with it. */}
        {symbolFor(movement) !== "OTHER" && (
          <ImplementShape kind={symbolFor(movement)} size={lu(30)} />
        )}
        <span className="truncate font-semibold" style={{ fontSize: lu(22) }}>
          {equipmentName(movement)}
        </span>
        {block.load && (
          <span className="num font-semibold" style={{ fontSize: lu(20) }}>
            {block.load}
          </span>
        )}
      </div>
    );
  }

  if (block.kind === "bars") {
    return (
      <>
        {block.loads.map((entry, index) => (
          <Barbell
            key={index}
            who={entry.who}
            note={null}
            loading={loadBar(readKilos(entry.load) ?? 0, entry.bar)}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {block.loads.map((entry, index) => (
        <div
          key={index}
          className="flex items-center"
          style={{
            gap: lu(14),
            padding: lu(14),
            borderRadius: lu(12),
            background: "rgba(255,255,255,.07)",
          }}
        >
          {/* The shape says what to fetch, the number says how heavy. */}
          <span
            className="font-display num flex shrink-0 items-center justify-center font-bold"
            style={{
              minWidth: lu(150),
              height: lu(64),
              padding: `0 ${lu(14)}`,
              gap: lu(10),
              borderRadius: lu(28),
              background: "var(--brand-secondary)",
              fontSize: lu(30),
            }}
          >
            <ImplementShape kind={symbolFor(movement)} size={lu(34)} />
            {entry.load}
          </span>
          <div className="flex min-w-0 flex-col" style={{ gap: lu(2) }}>
            <span className="truncate font-semibold" style={{ fontSize: lu(20) }}>
              {equipmentName(movement)}
            </span>
            <span
              className="truncate"
              style={{ fontSize: lu(15), color: "var(--color-screen-muted)" }}
            >
              {entry.who ??
                (movement.loadMode === "SHARED" ? "One between the team" : "One each")}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}

/** The whole bar, plates on both sides, in the colours they come in. */
function Barbell({
  loading,
  who,
  note,
}: {
  loading: Loading;
  /** Whose bar this is, when a mixed pair needs two. */
  who: string | null;
  /** A line under the bar; none on the floor plan, which only shows kit. */
  note: string | null;
}) {
  const bar = lu(84);

  return (
    <div
      className="flex flex-col"
      style={{
        padding: `${lu(12)} ${lu(14)}`,
        borderRadius: lu(12),
        background: "rgba(255,255,255,.07)",
        gap: lu(8),
      }}
    >
      <div className="flex items-baseline justify-between" style={{ gap: lu(8) }}>
        <span className="truncate font-semibold" style={{ fontSize: lu(20) }}>
          {who ?? (loading.bar === 20 ? "Men's bar" : "Women's bar")}
        </span>
        <span className="font-display num shrink-0 font-bold" style={{ fontSize: lu(34) }}>
          {loading.shortBy === 0 ? `${kilos(loading)} kg` : "—"}
        </span>
      </div>

      {loading.shortBy === 0 ? (
        <span className="flex items-center" style={{ height: bar }}>
          <span
            style={{
              width: lu(12),
              height: lu(10),
              background: "#B8B2A6",
              borderRadius: `${lu(2)} 0 0 ${lu(2)}`,
            }}
          />
          {/* The heaviest plate goes on first, so it sits nearest the middle.
              Reading outwards they get lighter, which makes the left-hand side
              the same list backwards. */}
          {[...loading.perSide].reverse().map((kg, index) => (
            <Plate key={`left-${index}`} kg={kg} />
          ))}
          <span style={{ width: lu(6), height: lu(20), background: "#CFC9BD" }} />
          <span
            className="grow"
            style={{ height: lu(loading.bar === 20 ? 8 : 6), background: "#B8B2A6" }}
          />
          <span style={{ width: lu(6), height: lu(20), background: "#CFC9BD" }} />
          {loading.perSide.map((kg, index) => (
            <Plate key={`right-${index}`} kg={kg} />
          ))}
          <span
            style={{
              width: lu(12),
              height: lu(10),
              background: "#B8B2A6",
              borderRadius: `0 ${lu(2)} ${lu(2)} 0`,
            }}
          />
        </span>
      ) : (
        <span
          className="flex items-center font-semibold"
          style={{ height: bar, fontSize: lu(20), color: "#F0A08C" }}
        >
          {loading.shortBy < 0
            ? `Lighter than the ${loading.bar} kg bar`
            : `Cannot be loaded — ${loading.shortBy} kg short`}
        </span>
      )}

      <span className="truncate" style={{ fontSize: lu(15), color: "var(--color-screen-muted)" }}>
        {note ? `${note} · ` : ""}
        {loading.bar} kg bar
      </span>
    </div>
  );
}

/** What a loading adds up to, which is what the lane actually lifts. */
function kilos(loading: Loading): number {
  return loading.bar + loading.perSide.reduce((total, plate) => total + plate, 0) * 2;
}

/** One plate, in the colour that weight is actually made in. */
function Plate({ kg }: { kg: number }) {
  const plate = PLATES.find((p) => p.kg === kg)!;
  // The design's plates are drawn against an 84-unit bar; the shared table is
  // sized for the admin screen, so scale it up by the same amount both ways.
  const scale = 84 / 60;
  return (
    <span
      className="shrink-0 box-border"
      style={{
        width: lu(plate.width * scale),
        height: lu(plate.height * scale),
        background: plate.colour,
        // Every plate is rimmed so it reads as a plate. The 5 kg one is black,
        // which against a near-black card would otherwise look like a gap in
        // the bar rather than the heaviest thing on this end of it.
        border: `${lu(plate.kg === 5 ? 3 : 1.5)} solid rgba(255,255,255,${plate.kg === 5 ? 0.75 : 0.4})`,
        borderRadius: lu(3),
      }}
    />
  );
}

/* ---------------------------------------------------------------- */

/** The workout itself, down the left-hand side. */
function Workout({
  event,
  subtitle,
  teamSize,
}: {
  event: { scoreType: string; movements: MovementRow[] };
  /** Worked out by the page, which needs its length to size the panel. */
  subtitle: string;
  teamSize: number;
}) {
  const sixtyPlus = event.movements.some((movement) => movement.loadSixtyPlus);

  return (
    <section
      className="flex shrink-0 flex-col"
      style={{
        width: u(560),
        padding: `${wu(26)} ${wu(28)}`,
        borderRadius: u(16),
        background: "rgba(255,255,255,.06)",
        gap: wu(18),
      }}
    >
      <div className="flex flex-col" style={{ gap: wu(4) }}>
        <span
          className="font-display font-bold uppercase"
          style={{ fontSize: wu(30) }}
        >
          {describeScoreType(event.scoreType)} · {describeTeamSize(teamSize)}
        </span>
        <span style={{ fontSize: wu(18), color: "var(--color-screen-muted)" }}>
          {subtitle}
        </span>
      </div>

      {event.movements.map((movement) => {
        const chips = chipsFor(movement);
        return (
          <div
            key={movement.id}
            className="flex flex-col"
            style={{
              gap: wu(10),
              paddingTop: wu(16),
              borderTop: "1px solid rgba(255,255,255,.14)",
            }}
          >
            <div className="flex items-baseline" style={{ gap: wu(16) }}>
              <span
                className="font-display num font-bold"
                style={{
                  fontSize: wu(64),
                  lineHeight: 0.9,
                  // The brand colour, lightened, so the count reads first
                  // without turning the board into a Christmas tree.
                  color: "var(--reps)",
                }}
              >
                {movement.reps}
              </span>
              <span className="truncate font-semibold" style={{ fontSize: wu(32) }}>
                {movement.name}
              </span>
            </div>

            {chips.length > 0 && (
              <div className="flex flex-col" style={{ gap: wu(6) }}>
                <span
                  className="font-bold uppercase"
                  style={{
                    fontSize: wu(15),
                    color: "var(--color-screen-muted)",
                    letterSpacing: ".06em",
                  }}
                >
                  {loadHeading(movement)}
                </span>
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${chips.length}, minmax(0, 1fr))`,
                    gap: wu(8),
                  }}
                >
                  {chips.map(([who, load]) => (
                    <div
                      key={who}
                      className="flex min-w-0 flex-col"
                      style={{
                        padding: `${wu(8)} ${wu(10)}`,
                        borderRadius: wu(8),
                        background: "rgba(255,255,255,.08)",
                      }}
                    >
                      <span
                        className="truncate"
                        style={{ fontSize: wu(15), color: "var(--color-screen-muted)" }}
                      >
                        {who}
                      </span>
                      <span
                        className="font-display num truncate font-bold"
                        style={{ fontSize: wu(28) }}
                      >
                        {load}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {sixtyPlus && (
        <span
          className="mt-auto"
          style={{ fontSize: wu(16), color: "var(--color-screen-muted)", lineHeight: 1.4 }}
        >
          A 60+ athlete lifts the 60+ load for their own sex; their partner
          lifts theirs. A movement done in sync puts both on the lighter of
          the two. Anything shared sits halfway between them.
        </span>
      )}
    </section>
  );
}

function loadHeading(movement: MovementRow): string {
  const shared = movement.loadMode === "SHARED";
  // Same reason as in `planBlock`: a movement nobody set an implement on says
  // barbell. Only name the thing when the loads bear it out.
  if (movement.implement === "BARBELL" && !couldBeABar(movement)) {
    return shared ? "One between the team" : "One each";
  }
  const noun = implementNoun(movement.implement);
  return shared ? `One ${noun} between the team` : `Each athlete, own ${noun}`;
}

/**
 * Which shape to draw for a movement.
 *
 * `implement` defaults to BARBELL, so a movement nobody set it on claims to be
 * one. Where the loads say otherwise — a 6 kg wall ball, a 60 cm box — draw
 * the general shape rather than a barbell that is not there.
 */
function symbolFor(movement: MovementRow): string {
  return movement.implement === "BARBELL" && !couldBeABar(movement)
    ? "OTHER"
    : movement.implement;
}

/** Whether a movement's loads are weights that would go on a bar at all. */
function couldBeABar(movement: MovementRow): boolean {
  const loads = chipsFor(movement).map(([, load]) => readKilos(load));
  return loads.length > 0 && loads.every((kg) => kg !== null && kg >= WOMENS_BAR);
}

/**
 * The brand colour, lightened until it reads on the dark screen.
 *
 * The reps are the first thing anybody looks for, so the design tints them.
 * Mixing towards white washes the colour out — a dark green goes grey — so
 * this keeps the hue and how strong it is, and only lifts how light it is.
 */
function lightened(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#ffffff";

  const packed = parseInt(match[1], 16);
  const [r, g, b] = [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255].map(
    (part) => part / 255,
  );
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const spread = high - low;
  const light = (high + low) / 2;
  const saturation = spread === 0 ? 0 : spread / (1 - Math.abs(2 * light - 1));

  let hue = 0;
  if (spread !== 0) {
    hue =
      high === r
        ? ((g - b) / spread) % 6
        : high === g
          ? (b - r) / spread + 2
          : (r - g) / spread + 4;
    hue = (hue * 60 + 360) % 360;
  }

  return `hsl(${Math.round(hue)} ${Math.round(saturation * 100)}% 62%)`;
}

/**
 * The loads to show for a movement: the categories somebody wrote one for.
 *
 * What the four columns are called depends on how the load is lifted — a
 * weight each athlete lifts belongs to the athlete (M, W, M60+, W60+), and
 * one the team shares belongs to the pairing (M/M, W/W, Mixed, 60+).
 */
function chipsFor(movement: MovementRow): [string, string][] {
  // One bag between a mixed pair sits halfway between the men's and the
  // women's, so it can be worked out rather than left blank. Saying it here
  // as well keeps the board and the lanes under it telling the same story.
  const derivedMixed =
    movement.loadMode === "SHARED" &&
    !movement.loadMixed &&
    movement.loadMenMen &&
    movement.loadWomenWomen
      ? sharedLoad([movement.loadMenMen, movement.loadWomenWomen])
      : null;

  return loadColumns(movement.loadMode)
    .map(
      (column) =>
        [
          column.label,
          column.field === "loadMixed"
            ? (movement.loadMixed ?? derivedMixed)
            : movement[column.field],
        ] as [string, string | null],
    )
    .filter((entry): entry is [string, string] => Boolean(entry[1]));
}

/** The line under the heading: how the workout is shared out, and the cap. */
function subtitleFor(teamSize: number, timeCapSeconds: number | null): string {
  const split = teamSize > 1 ? "Split the reps any way you like. " : "";
  return (
    split +
    (timeCapSeconds !== null
      ? "Anyone still going at the cap is scored on the reps they finished."
      : "No time cap.")
  );
}

function describeScoreType(scoreType: string): string {
  switch (scoreType) {
    case "TIME":
      return "For time";
    case "TIME_OR_REPS":
      return "For time, or reps at the cap";
    case "REPS":
      return "For reps";
    case "ROUNDS_REPS":
      return "As many rounds as possible";
    case "WEIGHT":
      return "For load";
    default:
      return scoreType;
  }
}

function describeTeamSize(size: number): string {
  if (size <= 1) return "on your own";
  if (size === 2) return "in pairs";
  if (size === 3) return "in threes";
  return `in ${size}s`;
}

/**
 * First names where they are unmistakable, full names where they are not.
 *
 * A lane is read across the gym, so "Anna & Oskar" beats "Anna Svensson &
 * Oskar Nyström" — right up until there are two Annas, at which point the
 * short version is worse than useless.
 */
function shortNames(everyone: string[]): (name: string) => string {
  const counts = new Map<string, number>();
  for (const name of everyone) {
    const first = name.split(" ")[0];
    counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  return (name) => {
    const first = name.split(" ")[0];
    return counts.get(first) === 1 ? first : name;
  };
}

/** The screen with nothing to show on it yet. */
function Nothing({
  competitionId,
  children,
}: {
  competitionId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 text-center font-sans"
      style={{
        ["--u" as string]: "min(100vw / 1920, 100vh / 1080)",
        background: "var(--brand-screen-bg)",
        color: "#fff",
        padding: u(80),
      }}
    >
      <p style={{ fontSize: u(36), color: "var(--color-screen-muted)", maxWidth: u(1100) }}>
        {children}
      </p>
      <Link href={`/competitions/${competitionId}`} className="underline" style={{ fontSize: u(24) }}>
        Back to setup
      </Link>
    </div>
  );
}
