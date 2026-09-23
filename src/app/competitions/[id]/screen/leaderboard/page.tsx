import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadLeaderboard, type LeaderboardRow } from "@/lib/leaderboard";
import { SwitchAfter } from "@/components/switch-after";
import { TEAM_CLASSES } from "@/lib/team-class";
import { loadTheme } from "@/lib/theme";
import { describePointsSystem } from "@/lib/scoring";

/**
 * The leaderboard as shown on a TV, from Leaderboard.dc.html.
 *
 * The design is drawn at 1920x1080. Rather than fixing those pixel sizes,
 * every measurement is a multiple of `--u`, one 1920th of the screen width.
 * The whole board then scales to whatever it is plugged into, and still looks
 * exactly like the design on a 1080p screen.
 *
 * Fixed teams are ranked per division and class, so there a screen is one
 * division — RX, say — with W/W, M/M and Mixed side by side in three
 * columns, showing only the total points, and it takes turns with the next
 * division on a timer (Carin, 23 September 2026). A TV has nobody standing at
 * it to press a tab.
 */

export const dynamic = "force-dynamic";

/**
 * How much room the rows have, in the design's own pixels: the screen's 1080,
 * less the header the rows start under (249), the footer (27), the gap above
 * it (26) and the padding below it (44). Measured off the built screen rather
 * than guessed, because guessing it is what left the first attempt 37 short.
 */
const ROWS_HEIGHT = 734;

/** A class heading on the fixed-teams board, in the design's pixels. */
const HEADING_HEIGHT = 40;

/** How long each division stays up before the board moves on. */
const SWITCH_SECONDS = 20;

/**
 * Sizes step up when there are few rows, so a short board fills the screen —
 * and down when there are many, so a long one still fits on it.
 *
 * The stepping up is the design. The shrinking is not: without it a field of
 * twenty ran off the bottom of the screen, and a television cannot scroll, so
 * the last seven athletes were simply not there. Nothing said so.
 */
function sizing(count: number, headings = 0, narrow = false) {
  const big = count <= 6;
  const ideal = count <= 4 ? 132 : count <= 6 ? 108 : count <= 10 ? 66 : 54;
  const gap = big ? 14 : count <= 10 ? 8 : 6;

  // Headings sit in the same column as the rows, so they come off the room
  // the rows have. They do not shrink: they are small already.
  const room = ROWS_HEIGHT - headings * (HEADING_HEIGHT + gap);
  const wanted = count * ideal + Math.max(0, count - 1) * gap;
  // Never above 1: a short board is drawn at the size the design says rather
  // than blown up to fill the height.
  const fit = Math.min(1, room / Math.max(wanted, 1));

  return {
    rowHeight: ideal * fit,
    gap: gap * fit,
    // The text shrinks with the row, or it would outgrow the row it sits in.
    // A column a third of the screen wide has room for a team name only at
    // a smaller size.
    nameSize: (narrow ? (big ? 34 : 28) : big ? 44 : 30) * fit,
    rankSize: (big ? 56 : 38) * fit,
    eventSize: 28 * fit,
    resultSize: 18 * fit,
  };
}

export default async function LeaderboardScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ division?: string; show?: string }>;
}) {
  const { id } = await params;
  const { division: wanted, show = "ten" } = await searchParams;

  const competition = await db.competition.findUnique({ where: { id } });
  if (!competition) notFound();

  const theme = loadTheme();
  const { events, divisions } = await loadLeaderboard(id);

  const limit = show === "five" ? 5 : show === "all" ? Infinity : 10;
  const fixed = competition.mode === "FIXED_TEAM";

  // What the tabs choose between: for fixed teams a division, whose classes
  // all go on the screen together; otherwise one board.
  const choices = fixed
    ? [...new Map(divisions.map((d) => [d.divisionId ?? "none", d.groupName])).entries()].map(
        ([key, name]) => ({ key, name }),
      )
    : divisions.map((d) => ({ key: d.key, name: d.divisionName }));
  const chosenIndex = Math.max(
    0,
    choices.findIndex((choice) => choice.key === wanted),
  );
  const chosen = choices[chosenIndex];

  // Each section is one ranking, with its own first place. For fixed teams
  // every class gets its column even when it has nobody, so RX and Scaled
  // look the same and W/W is always on the left.
  const boards = fixed
    ? divisions.filter((d) => (d.divisionId ?? "none") === chosen?.key)
    : divisions.filter((d) => d.key === chosen?.key);
  const headingsInOrder = fixed
    ? [
        ...TEAM_CLASSES.map((option) => option.label as string),
        ...boards
          .map((d) => d.className ?? "")
          .filter((name) => !TEAM_CLASSES.some((option) => option.label === name)),
      ]
    : [null];
  const sections = headingsInOrder.map((heading) => {
    const board = fixed ? boards.find((d) => d.className === heading) : boards[0];
    return {
      key: board?.key ?? `empty:${heading}`,
      heading,
      total: board?.rows.length ?? 0,
      rows: board?.rows.slice(0, limit) ?? [],
    };
  });
  const rowCount = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const totalCount = sections.reduce((sum, section) => sum + section.total, 0);
  // Side by side, so the tallest column decides the row size.
  const sizes = fixed
    ? sizing(Math.max(0, ...sections.map((section) => section.rows.length)), 1, true)
    : sizing(rowCount);

  const next = choices.length > 1 ? choices[(chosenIndex + 1) % choices.length] : null;
  const nextHref = next ? `?division=${next.key}&show=${show}` : null;

  // Six event columns at most, or the board stops being readable from the far
  // side of the gym.
  const shown = events.slice(0, 6);
  // Fixed widths for place, the event columns and points; the name takes
  // whatever is left. Getting this wrong collapses the name to nothing.
  const columns = [
    "calc(100 * var(--u))",
    "minmax(calc(240 * var(--u)), 1fr)",
    ...shown.map(() => "calc(230 * var(--u))"),
    "calc(160 * var(--u))",
  ].join(" ");
  // Fixed teams: place, team and total, in a column a third of the screen.
  const teamColumns = ["calc(64 * var(--u))", "minmax(0, 1fr)", "calc(100 * var(--u))"].join(" ");

  const scored = events.filter((event) =>
    divisions.some((d) => d.rows.some((r) => r.pointsByEvent[event.id] !== undefined)),
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden font-sans"
      style={{
        // One unit = 1/1920 of the width. Everything below is a multiple of it.
        // The smaller of the two, so the board keeps its shape and fits a
        // window of any proportion rather than running off the bottom.
        ["--u" as string]: "min(100vw / 1920, 100vh / 1080)",
        background: "var(--brand-screen-bg)",
        color: "#fff",
        padding: "calc(44 * var(--u)) calc(64 * var(--u))",
        gap: "calc(26 * var(--u))",
      }}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: "calc(32 * var(--u))" }}>
          {theme.logoDark ? (
            <Image
              src={theme.logoDark}
              alt={theme.name}
              width={320}
              height={96}
              unoptimized
              style={{ height: "calc(96 * var(--u))", width: "auto" }}
            />
          ) : (
            <span
              aria-hidden
              style={{
                width: "calc(14 * var(--u))",
                height: "calc(96 * var(--u))",
                background: "var(--brand-primary)",
                borderRadius: "calc(4 * var(--u))",
              }}
            />
          )}
          <span
            style={{
              width: "calc(2 * var(--u))",
              height: "calc(72 * var(--u))",
              background: "rgba(255,255,255,.2)",
            }}
          />
          <div className="flex flex-col" style={{ gap: "calc(6 * var(--u))" }}>
            <span
              className="font-stencil uppercase leading-none"
              style={{ fontSize: "calc(56 * var(--u))" }}
            >
              {competition.name}
            </span>
            <span
              style={{ fontSize: "calc(22 * var(--u))", color: "var(--color-screen-muted)" }}
            >
              {scored > 0
                ? `After event ${scored} of ${events.length}`
                : `${events.length} events · no scores yet`}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end" style={{ gap: "calc(14 * var(--u))" }}>
          <div className="flex items-center" style={{ gap: "calc(12 * var(--u))" }}>
            <span
              className="font-semibold uppercase"
              style={{
                fontSize: "calc(18 * var(--u))",
                background: "var(--brand-primary)",
                padding: "calc(6 * var(--u)) calc(14 * var(--u))",
                borderRadius: "calc(8 * var(--u))",
                letterSpacing: ".08em",
              }}
            >
              Live
            </span>
            <span
              className="font-display font-bold uppercase"
              style={{ fontSize: "calc(40 * var(--u))" }}
            >
              {chosen ? (fixed ? `${chosen.name} · teams` : chosen.name) : "Leaderboard"}
            </span>
          </div>

          <div className="flex" style={{ gap: "calc(12 * var(--u))" }}>
            {choices.length > 1 && (
              <Tabs
                options={choices.map((choice) => ({
                  label: choice.name,
                  href: `?division=${choice.key}&show=${show}`,
                  selected: choice === chosen,
                }))}
              />
            )}
            <Tabs
              options={[
                { key: "five", label: "Top 5" },
                { key: "ten", label: "Top 10" },
                { key: "all", label: "All" },
              ].map((option) => ({
                label: option.label,
                href: `?division=${chosen?.key ?? "none"}&show=${option.key}`,
                selected: show === option.key,
              }))}
            />
          </div>
        </div>
      </header>

      {fixed ? (
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))`,
            gap: "calc(32 * var(--u))",
          }}
        >
          {sections.map((section) => (
            <section
              key={section.key}
              className="flex min-w-0 flex-col"
              style={{ gap: `calc(${sizes.gap} * var(--u))` }}
            >
              <h2
                className="flex items-end justify-between"
                style={{
                  height: `calc(${HEADING_HEIGHT} * var(--u))`,
                  padding: "0 calc(24 * var(--u))",
                  color: "var(--color-screen-muted)",
                }}
              >
                <span
                  className="font-display font-bold uppercase"
                  style={{ fontSize: "calc(34 * var(--u))", letterSpacing: ".04em" }}
                >
                  {section.heading}
                </span>
                <span
                  className="font-semibold uppercase"
                  style={{ fontSize: "calc(18 * var(--u))", letterSpacing: ".06em" }}
                >
                  Points
                </span>
              </h2>
              {section.rows.map((row, index) => (
                <Row
                  key={row.unitId}
                  row={row}
                  index={index}
                  events={[]}
                  columns={teamColumns}
                  sizes={sizes}
                />
              ))}
              {section.rows.length === 0 && (
                <p
                  style={{
                    padding: "0 calc(24 * var(--u))",
                    fontSize: "calc(24 * var(--u))",
                    color: "var(--color-screen-muted)",
                  }}
                >
                  No teams
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <>
          <div
            className="grid font-semibold uppercase"
            style={{
              gridTemplateColumns: columns,
              gap: "calc(16 * var(--u))",
              padding: "0 calc(24 * var(--u))",
              fontSize: "calc(18 * var(--u))",
              color: "var(--color-screen-muted)",
              letterSpacing: ".06em",
            }}
          >
            <span>Place</span>
            <span>{competition.mode === "SCRAMBLE" ? "Athlete" : "Team"}</span>
            {shown.map((event) => (
              <span key={event.id} className="truncate">
                {event.name}
              </span>
            ))}
            <span className="text-right">Points</span>
          </div>

          <div className="flex flex-col" style={{ gap: `calc(${sizes.gap} * var(--u))` }}>
            {sections[0]?.rows.map((row, index) => (
              <Row
                key={row.unitId}
                row={row}
                index={index}
                events={shown}
                columns={columns}
                sizes={sizes}
              />
            ))}
            {rowCount === 0 && (
              <p style={{ fontSize: "calc(28 * var(--u))", color: "var(--color-screen-muted)" }}>
                No athletes yet.
              </p>
            )}
          </div>
        </>
      )}

      <footer
        className="mt-auto flex justify-between"
        style={{ fontSize: "calc(18 * var(--u))", color: "var(--color-screen-muted)" }}
      >
        <span>{describePointsSystem(competition.pointsSystem)}</span>
        <span>
          Showing {rowCount} of {totalCount} ·{" "}
          {fixed && next && nextHref && (
            <>
              <SwitchAfter key={nextHref} href={nextHref} seconds={SWITCH_SECONDS} to={next.name} />{" "}
              ·{" "}
            </>
          )}
          <Link href={`/competitions/${id}`} className="underline">
            back to setup
          </Link>
        </span>
      </footer>
    </div>
  );
}

function Tabs({
  options,
}: {
  options: { label: string; href: string; selected: boolean }[];
}) {
  return (
    <div
      className="flex"
      style={{
        background: "rgba(255,255,255,.08)",
        borderRadius: "calc(10 * var(--u))",
        padding: "calc(4 * var(--u))",
        gap: "calc(4 * var(--u))",
      }}
    >
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          className="flex items-center font-semibold"
          style={{
            height: "calc(44 * var(--u))",
            padding: "0 calc(20 * var(--u))",
            borderRadius: "calc(8 * var(--u))",
            fontSize: "calc(17 * var(--u))",
            background: option.selected ? "#fff" : "transparent",
            color: option.selected ? "#231f20" : "#fff",
          }}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

function Row({
  row,
  index,
  events,
  columns,
  sizes,
}: {
  row: LeaderboardRow;
  index: number;
  events: { id: string; name: string }[];
  columns: string;
  sizes: ReturnType<typeof sizing>;
}) {
  const { rowHeight, nameSize, rankSize, eventSize, resultSize } = sizes;
  // Leader in the brand colour, the rest of the podium in the secondary, and
  // everyone else on a faint wash.
  const background =
    index === 0
      ? "var(--brand-primary)"
      : index < 3
        ? "var(--brand-secondary)"
        : "rgba(255,255,255,.06)";

  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: columns,
        gap: "calc(16 * var(--u))",
        padding: "0 calc(24 * var(--u))",
        height: `calc(${rowHeight} * var(--u))`,
        borderRadius: "calc(12 * var(--u))",
        background,
      }}
    >
      <span
        className="num font-display font-bold"
        style={{ fontSize: `calc(${rankSize} * var(--u))` }}
      >
        {row.position || "–"}
      </span>

      <span
        className="truncate font-semibold"
        style={{ fontSize: `calc(${nameSize} * var(--u))` }}
      >
        {row.name}
      </span>

      {events.map((event) => (
        <div key={event.id} className="flex items-baseline" style={{ gap: "calc(10 * var(--u))" }}>
          <span
            className="num font-display font-bold"
            style={{ fontSize: `calc(${eventSize} * var(--u))` }}
          >
            {row.pointsByEvent[event.id] ?? "–"}
          </span>
          <span className="num" style={{ fontSize: `calc(${resultSize} * var(--u))`, opacity: 0.8 }}>
            {row.resultsByEvent[event.id] ?? ""}
          </span>
        </div>
      ))}

      <span
        className="num font-display text-right font-bold"
        style={{ fontSize: `calc(${rankSize} * var(--u))` }}
      >
        {row.totalPoints}
      </span>
    </div>
  );
}
