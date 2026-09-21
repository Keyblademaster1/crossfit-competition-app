import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadLeaderboard, type LeaderboardRow } from "@/lib/leaderboard";
import { loadTheme } from "@/lib/theme";
import { describePointsSystem } from "@/lib/scoring";

/**
 * The leaderboard as shown on a TV, from Leaderboard.dc.html.
 *
 * The design is drawn at 1920x1080. Rather than fixing those pixel sizes,
 * every measurement is a multiple of `--u`, one 1920th of the screen width.
 * The whole board then scales to whatever it is plugged into, and still looks
 * exactly like the design on a 1080p screen.
 */

export const dynamic = "force-dynamic";

/** Sizes step up when there are few rows, so a short board fills the screen. */
function sizing(count: number) {
  const rowHeight = count <= 4 ? 132 : count <= 6 ? 108 : count <= 10 ? 66 : 54;
  const big = count <= 6;
  return {
    rowHeight,
    gap: big ? 14 : count <= 10 ? 8 : 6,
    nameSize: big ? 44 : 30,
    rankSize: big ? 56 : 38,
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

  const board =
    divisions.find((d) => (d.divisionId ?? "none") === wanted) ?? divisions[0];

  const limit = show === "five" ? 5 : show === "all" ? Infinity : 10;
  const rows = board ? board.rows.slice(0, limit) : [];
  const { rowHeight, gap, nameSize, rankSize } = sizing(rows.length);

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

  const scored = events.filter((event) =>
    divisions.some((d) => d.rows.some((r) => r.pointsByEvent[event.id] !== undefined)),
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden font-sans"
      style={{
        // One unit = 1/1920 of the width. Everything below is a multiple of it.
        ["--u" as string]: "calc(100vw / 1920)",
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
              {board?.divisionName ?? "Leaderboard"}
            </span>
          </div>

          <div className="flex" style={{ gap: "calc(12 * var(--u))" }}>
            {divisions.length > 1 && (
              <Tabs
                options={divisions.map((d) => ({
                  label: d.divisionName,
                  href: `?division=${d.divisionId ?? "none"}&show=${show}`,
                  selected: d === board,
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
                href: `?division=${board?.divisionId ?? "none"}&show=${option.key}`,
                selected: show === option.key,
              }))}
            />
          </div>
        </div>
      </header>

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

      <div className="flex flex-col" style={{ gap: `calc(${gap} * var(--u))` }}>
        {rows.map((row, index) => (
          <Row
            key={row.unitId}
            row={row}
            index={index}
            events={shown}
            columns={columns}
            rowHeight={rowHeight}
            nameSize={nameSize}
            rankSize={rankSize}
          />
        ))}
        {rows.length === 0 && (
          <p style={{ fontSize: "calc(28 * var(--u))", color: "var(--color-screen-muted)" }}>
            No athletes yet.
          </p>
        )}
      </div>

      <footer
        className="mt-auto flex justify-between"
        style={{ fontSize: "calc(18 * var(--u))", color: "var(--color-screen-muted)" }}
      >
        <span>{describePointsSystem(competition.pointsSystem)}</span>
        <span>
          Showing {rows.length} of {board?.rows.length ?? 0} ·{" "}
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
  rowHeight,
  nameSize,
  rankSize,
}: {
  row: LeaderboardRow;
  index: number;
  events: { id: string; name: string }[];
  columns: string;
  rowHeight: number;
  nameSize: number;
  rankSize: number;
}) {
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
            style={{ fontSize: "calc(28 * var(--u))" }}
          >
            {row.pointsByEvent[event.id] ?? "–"}
          </span>
          <span className="num" style={{ fontSize: "calc(18 * var(--u))", opacity: 0.8 }}>
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
