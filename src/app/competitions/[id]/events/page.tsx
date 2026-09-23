import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { IMPLEMENTS } from "@/components/implement";
import { INDIVIDUAL_LOADS, TEAM_LOADS } from "@/lib/heats";
import {
  addEventFromBuilder,
  updateEvent,
  deleteEvent,
  addBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  copyVersion,
  addMovement,
  updateMovement,
  deleteMovement,
  moveMovement,
} from "@/lib/actions";
import { formatTime } from "@/lib/score-format";
import {
  FORMATS,
  FORMAT_ORDER,
  SPLITS,
  blockSummary,
  totalReps,
  versionOf,
  type BlockPlan,
} from "@/lib/workout";
import { inputClass } from "@/components/ui";
import { AutoSaveForm } from "@/components/auto-save-form";

/**
 * The event builder, from design/app/event-builder/Events.dc.html.
 *
 * An event is a stack of blocks — "for time", "AMRAP 12", "rest 2:00" — each
 * with its own movements, the way a Garmin workout is built. Writing the
 * workout out in full is what everything else works from: how to load a bar,
 * what to bring out for each heat, how a capped athlete's reps add up, and
 * how the event is scored. Nothing here has a Save button; every part writes
 * itself, as score entry does.
 *
 * One screen for all three formats. Individual hides how the work is split
 * and the shared loads. Fixed teams (EventsTeams.dc.html) give each division,
 * RX and Scaled, its own version of the workout, switched between above the
 * blocks, and have no 60+ loads.
 */

export const dynamic = "force-dynamic";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The four load boxes, and what each means for a row whose load everyone
 * lifts themselves, or one the team shares. See `loadColumns` in heats.ts,
 * which reads them the same way.
 */
const LOAD_COLUMNS = INDIVIDUAL_LOADS.map((column, index) => ({
  field: column.field,
  each: ["Man", "Woman", "60+ man", "60+ woman"][index],
  shared: TEAM_LOADS[index].label,
}));

const SCORING_TEXT = {
  TIME_OR_REPS: {
    title: "Scored: time, or reps at the cap",
    ranking: "Finishers first, then most reps",
  },
  WEIGHT: {
    title: "Scored: heaviest lift",
    ranking: "Heaviest lift first",
  },
  ROUNDS_REPS: {
    title: "Scored: rounds and reps",
    ranking: "Most rounds and reps first",
  },
} as const;

export default async function EventBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ event?: string; from?: string; division?: string }>;
}) {
  const { id } = await params;
  const { event: wantedEvent, from, division: wantedDivision } = await searchParams;
  // Opened from the setup wizard's Events step: going back leads there, and
  // moving between events keeps remembering it.
  const fromSetup = from === "setup";

  const competition = await db.competition.findUnique({
    where: { id },
    include: {
      events: {
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: {
          blocks: {
            orderBy: { position: "asc" },
            include: { movements: { orderBy: { position: "asc" } } },
          },
        },
      },
      divisions: { orderBy: { position: "asc" } },
    },
  });
  if (!competition) notFound();

  // Fixed teams: which division's version is being edited. Everywhere else
  // there is one version, held with no division.
  const byDivision = competition.mode === "FIXED_TEAM" && competition.divisions.length > 0;
  const firstDivision = competition.divisions[0]?.id ?? null;
  const division = byDivision
    ? (competition.divisions.find((d) => d.id === wantedDivision) ?? competition.divisions[0])
    : null;
  const divisionId = division?.id ?? null;
  const version = <T extends { divisionId: string | null }>(blocks: T[]) =>
    versionOf(blocks, divisionId, firstDivision);
  const keepFrom =
    (fromSetup ? "&from=setup" : "") + (division ? `&division=${division.id}` : "");

  const found = competition.events.find((e) => e.id === wantedEvent) ?? competition.events[0];
  const selected = found && { ...found, blocks: version(found.blocks) };
  // The tiebreak is a block letter, the same in every version: "the end of
  // block B" in RX is the end of block B in Scaled too.
  const tiebreakIndex = found
    ? (() => {
        const block = found.blocks.find((b) => b.id === found.tiebreakBlockId);
        return block ? versionOf(found.blocks, block.divisionId, firstDivision).indexOf(block) : -1;
      })()
    : -1;
  // A division with nothing yet can start from the first division's version.
  const copyFrom =
    byDivision && found && division && division.id !== firstDivision && selected?.blocks.length === 0
      ? competition.divisions.find(
          (d) => d.id !== division.id && versionOf(found.blocks, d.id, firstDivision).length > 0,
        )
      : undefined;
  const individual = competition.mode === "INDIVIDUAL";
  const teams = !individual;
  // Fixed teams have no 60+ at all (EventsTeams.dc.html): man and woman,
  // and a mixed team's load, which only means something when it is shared.
  const fixedTeams = competition.mode === "FIXED_TEAM";
  const columns = fixedTeams
    ? LOAD_COLUMNS.slice(0, 3).map((column, index) => ({
        ...column,
        each: ["Man", "Woman", "Mixed team"][index],
        sharedOnly: index === 2,
      }))
    : LOAD_COLUMNS.map((column) => ({ ...column, sharedOnly: false }));
  const grid = `76px minmax(130px,1fr) 128px 104px repeat(${columns.length}, 74px) 84px`;

  const plans: BlockPlan[] =
    selected?.blocks.map((block) => ({
      id: block.id,
      format: block.format,
      setting: block.setting,
      split: block.split,
      movements: block.movements,
    })) ?? [];
  const scoring = selected ? SCORING_TEXT[selected.scoreType as keyof typeof SCORING_TEXT] ?? SCORING_TEXT.TIME_OR_REPS : null;

  const hidden = (
    <input type="hidden" name="competitionId" value={competition.id} />
  );

  return (
    <div
      // Wider than the rest of the app's pages: a movement row has nine
      // columns, and the design is drawn at 1280. The 32 pixels spare keep it
      // clear of a scrollbar.
      className="-my-6 flex min-h-[calc(100vh-64px)] flex-col xl:flex-row"
      style={{
        width: "min(calc(100vw - 32px), 1440px)",
        marginLeft: "calc(50% - min(calc(100vw - 32px), 1440px) / 2)",
      }}
    >
      {/* The events, down the left. */}
      <aside className="flex shrink-0 flex-col gap-2.5 border-b border-line bg-card px-[18px] py-6 xl:w-[290px] xl:border-b-0 xl:border-r">
        <Link
          href={
            fromSetup
              ? `/competitions/${competition.id}/setup?step=4`
              : `/competitions/${competition.id}`
          }
          className="flex h-8 items-center text-[14px] font-semibold text-muted"
        >
          ← {fromSetup ? "Setup" : competition.name || "Competition"}
        </Link>
        <span className="font-display text-[28px] font-bold uppercase">Events</span>

        {competition.events.map((event, index) => {
          const isSelected = event.id === selected?.id;
          return (
            <Link
              key={event.id}
              href={`/competitions/${competition.id}/events?event=${event.id}${keepFrom}`}
              className="flex items-center gap-3 rounded-[10px] px-3.5 py-3"
              style={{
                border: `2px solid ${isSelected ? "var(--brand-primary)" : "transparent"}`,
                background: isSelected ? "var(--paper)" : "var(--card)",
              }}
            >
              <span
                className="font-display num w-5 text-[26px] font-bold"
                style={{ color: isSelected ? "var(--brand-primary)" : "#A39D8F" }}
              >
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[16px] font-semibold">{event.name}</span>
                <span className="text-[13px] text-muted">
                  {version(event.blocks)
                    .map((block) => FORMATS[block.format].label)
                    .join(" + ") || "No blocks yet"}
                  {event.timeCapSeconds ? ` · cap ${formatTime(event.timeCapSeconds)}` : ""}
                </span>
              </span>
            </Link>
          );
        })}

        <form action={addEventFromBuilder}>
          {hidden}
          <input type="hidden" name="name" value={`Event ${competition.events.length + 1}`} />
          <input type="hidden" name="from" value={from ?? ""} />
          <button
            type="submit"
            className="h-12 w-full rounded-[10px] border border-dashed border-[#A39D8F] font-semibold"
          >
            + Add event
          </button>
        </form>

        <span className="mt-auto pt-4 text-[13px] leading-[1.45] text-muted">
          Every event is scored the same way: time if they finish, reps if the cap is hit.
          An event of only max-load work ranks on the heaviest lift.
        </span>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-4 px-6 py-[26px] xl:px-8">
        {!selected && (
          <p className="text-[15px] text-muted">
            No events yet. Press &ldquo;+ Add event&rdquo; to start building one.
          </p>
        )}

        {selected && scoring && (
          <>
            {/* Name and cap. */}
            <AutoSaveForm
              key={`event-${selected.id}`}
              action={updateEvent}
              className="flex flex-wrap items-end justify-between gap-5"
            >
              {hidden}
              <input type="hidden" name="eventId" value={selected.id} />
              <label className="flex min-w-64 flex-1 flex-col gap-1.5">
                <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
                  Event {competition.events.indexOf(found!) + 1} name
                </span>
                <input
                  name="name"
                  defaultValue={selected.name}
                  className="font-display h-[52px] border-0 border-b-2 border-ink bg-transparent p-0 text-[34px] font-bold uppercase outline-none"
                />
              </label>
              <label className="flex w-[120px] flex-col gap-1.5">
                <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
                  Time cap
                </span>
                <input
                  name="timeCap"
                  defaultValue={selected.timeCapSeconds ? formatTime(selected.timeCapSeconds) : ""}
                  placeholder="12:00"
                  className={`${inputClass} num text-[16px]`}
                />
              </label>
              <button
                type="submit"
                formAction={deleteEvent.bind(null, selected.id)}
                className="h-11 px-1 text-[13px] text-muted hover:text-ink"
              >
                Delete event
              </button>
            </AutoSaveForm>

            {/* How it is scored, worked out from the blocks. */}
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 rounded-[10px] bg-[#E9E4D8] px-4 py-3">
              <span className="text-[14px] font-bold">{scoring.title}</span>
              <span className="text-[14px] text-muted">
                {selected.scoreType === "WEIGHT"
                  ? "Only max-load work, so the heaviest lift wins."
                  : selected.scoreType === "ROUNDS_REPS"
                    ? "A single AMRAP: nobody finishes early, so it is rounds and reps done, entered as 5+12."
                    : `Finishers rank on time, capped ${teams ? "teams" : "athletes"} on reps done.`}{" "}
                {individual
                  ? "Individual competition, so everyone works alone, with 60+ loads."
                  : competition.mode === "SCRAMBLE"
                    ? "Scramble competition, so one version with 60+ loads."
                    : fixedTeams
                      ? `Fixed teams, so no 60+ loads.${division ? ` This is the ${division.name} version.` : ""}`
                      : ""}
              </span>
              <span className="font-display num ml-auto text-[15px] font-bold">
                {totalReps(plans)} reps in total
              </span>
            </div>

            {/* Fixed teams: RX and Scaled each have their own version. */}
            {byDivision && division && (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <nav
                  aria-label="Division"
                  className="flex items-center gap-1.5 rounded-[10px] bg-[#E9E4D8] p-1"
                >
                  {competition.divisions.map((d, index) => {
                    const chosen = d.id === division.id;
                    return (
                      <Link
                        key={d.id}
                        href={`/competitions/${competition.id}/events?event=${selected.id}${fromSetup ? "&from=setup" : ""}&division=${d.id}`}
                        aria-current={chosen ? "page" : undefined}
                        className="flex h-10 items-center rounded-lg px-5 font-semibold"
                        style={{
                          background: chosen
                            ? index === 0
                              ? "var(--brand-primary)"
                              : "var(--brand-secondary)"
                            : "transparent",
                          color: chosen ? "#fff" : "var(--ink)",
                        }}
                      >
                        {d.name}
                      </Link>
                    );
                  })}
                </nav>
                <span className="text-[14px] text-muted">
                  Fill in each division&apos;s own blocks, movements and loads. They are ranked
                  on separate leaderboards.
                </span>
              </div>
            )}

            {copyFrom && division && (
              <form className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[#A39D8F] px-4 py-3.5">
                {hidden}
                <span className="text-[15px]">
                  {division.name} has no workout yet. Start from a copy of {copyFrom.name}&apos;s
                  and change what differs, or add blocks below.
                </span>
                <button
                  type="submit"
                  formAction={copyVersion.bind(null, selected.id, copyFrom.id, division.id)}
                  className="flex h-10 items-center rounded-lg px-4 font-semibold text-white"
                  style={{ background: "var(--brand-secondary)" }}
                >
                  Copy the {copyFrom.name} version
                </button>
              </form>
            )}

            {/* The blocks. */}
            <div className="flex flex-col gap-3.5">
              {selected.blocks.map((block, blockIndex) => {
                const format = FORMATS[block.format];
                const plan = plans[blockIndex];
                return (
                  <section
                    key={block.id}
                    aria-label={`Block ${LETTERS[blockIndex]}`}
                    className="flex flex-col gap-2.5 rounded-xl border border-line bg-card px-4 py-3.5"
                  >
                    <AutoSaveForm
                      // A new format brings its own example setting, so the
                      // box has to be drawn afresh rather than keep the old one.
                      key={`${block.id}-${block.format}`}
                      action={updateBlock.bind(null, block.id)}
                      className="flex flex-wrap items-center gap-2.5"
                    >
                      {hidden}
                      <span
                        className="font-display flex h-[38px] w-[38px] items-center justify-center rounded-lg text-[22px] font-bold text-white"
                        style={{ background: "var(--brand-primary)" }}
                      >
                        {LETTERS[blockIndex]}
                      </span>
                      <span className="w-[190px]">
                        <select
                          name="format"
                          defaultValue={block.format}
                          aria-label="Block format"
                          className={`${inputClass} font-semibold`}
                        >
                          {FORMAT_ORDER.map((id) => (
                            <option key={id} value={id}>
                              {FORMATS[id].label}
                            </option>
                          ))}
                        </select>
                      </span>
                      {format.settingLabel && (
                        <span className="flex items-center gap-1.5">
                          <span className="w-[110px]">
                            <input
                              name="setting"
                              defaultValue={block.setting ?? ""}
                              aria-label={format.settingLabel}
                              className={`${inputClass} num text-center font-bold`}
                            />
                          </span>
                          <span className="text-[14px] text-muted">{format.settingLabel}</span>
                        </span>
                      )}
                      {teams && format.hasMovements && (
                        <span className="ml-auto flex items-center gap-1.5">
                          <span className="whitespace-nowrap text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
                            Work is split
                          </span>
                          <span className="w-[250px]">
                            <select
                              name="split"
                              defaultValue={block.split ?? "ANYHOW"}
                              aria-label="How the team splits the work"
                              className={inputClass}
                            >
                              {SPLITS.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </span>
                        </span>
                      )}
                      <span className={`flex items-center ${teams && format.hasMovements ? "" : "ml-auto"}`}>
                        <button
                          type="submit"
                          formAction={moveBlock.bind(null, block.id, -1)}
                          aria-label={`Move block ${LETTERS[blockIndex]} up`}
                          disabled={blockIndex === 0}
                          className="h-9 w-7 text-muted disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="submit"
                          formAction={moveBlock.bind(null, block.id, 1)}
                          aria-label={`Move block ${LETTERS[blockIndex]} down`}
                          disabled={blockIndex === selected.blocks.length - 1}
                          className="h-9 w-7 text-muted disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="submit"
                          formAction={deleteBlock.bind(null, block.id)}
                          aria-label={`Remove block ${LETTERS[blockIndex]}`}
                          className="h-9 w-9 text-[18px] text-muted hover:text-ink"
                        >
                          ×
                        </button>
                      </span>
                    </AutoSaveForm>

                    {format.hasMovements && (
                      // Fits from about 1000 pixels wide; narrower than that,
                      // as on a phone, the rows scroll sideways inside the block.
                      <div className="flex flex-col gap-1 overflow-x-auto">
                        <div
                          className="grid gap-2 whitespace-nowrap px-0.5 text-[12px] font-semibold uppercase tracking-[.06em] text-muted"
                          style={{ gridTemplateColumns: grid }}
                        >
                          <span>{block.format === "LADDER" ? "Reps" : format.perRound ? "Per round" : "Reps"}</span>
                          <span>Movement</span>
                          <span>On</span>
                          <span>Load</span>
                          {columns.map((column) => (
                            <span key={column.field} className="text-center">
                              {column.each}
                            </span>
                          ))}
                          <span />
                        </div>

                        {block.movements.map((movement, index) => {
                          const shared = teams && movement.loadMode === "SHARED";
                          return (
                            <AutoSaveForm
                              key={movement.id}
                              action={updateMovement.bind(null, movement.id)}
                              className="grid items-end gap-2"
                              style={{ gridTemplateColumns: grid }}
                            >
                              {hidden}
                              <input
                                name="reps"
                                type="number"
                                min={1}
                                defaultValue={movement.reps}
                                aria-label="Reps"
                                // A ladder's reps come from its scheme.
                                disabled={block.format === "LADDER"}
                                className="font-display num h-11 w-full rounded-lg border border-[#CEC8BA] bg-card text-center text-[19px] font-bold outline-none focus:border-ink disabled:bg-paper disabled:text-muted"
                              />
                              <input
                                name="name"
                                defaultValue={movement.name}
                                aria-label="Movement"
                                className={`${inputClass} font-semibold`}
                              />
                              {/* Plates are worked out for a barbell, and the
                                  heat's kit list is made from this. */}
                              <select
                                name="implement"
                                defaultValue={movement.implement}
                                aria-label="What it is done on"
                                className="h-11 rounded-lg border border-[#CEC8BA] bg-card px-1.5 text-[13px] font-semibold outline-none focus:border-ink"
                              >
                                {IMPLEMENTS.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              {teams ? (
                                <label
                                  className="flex h-11 cursor-pointer items-center justify-center rounded-lg text-[12px] font-bold"
                                  style={{
                                    border: `1px solid ${shared ? "var(--brand-secondary)" : "#CEC8BA"}`,
                                    background: shared ? "var(--brand-secondary)" : "var(--card)",
                                    color: shared ? "#fff" : "var(--ink)",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    name="shared"
                                    defaultChecked={shared}
                                    className="sr-only"
                                  />
                                  {shared ? "Shared" : "Each athlete"}
                                </label>
                              ) : (
                                <span className="flex h-11 items-center justify-center text-[13px] text-[#A39D8F]">
                                  Each athlete
                                </span>
                              )}
                              {columns.map((column) => {
                                const label = shared ? column.shared : column.each;
                                // A mixed team's box, on a row everyone lifts
                                // for themselves: nothing to fill in.
                                if (column.sharedOnly && !shared) {
                                  return <span key={column.field} />;
                                }
                                return (
                                  <span key={column.field} className="flex flex-col gap-0.5">
                                    {shared && (
                                      <span
                                        className="text-center text-[10px] font-bold"
                                        style={{ color: "var(--brand-secondary)" }}
                                      >
                                        {column.shared}
                                      </span>
                                    )}
                                    <input
                                      name={column.field}
                                      defaultValue={movement[column.field] ?? ""}
                                      aria-label={`Load, ${label}`}
                                      placeholder="–"
                                      className="num h-11 w-full rounded-lg border border-[#CEC8BA] bg-card px-1 text-center text-[14px] font-semibold outline-none focus:border-ink"
                                    />
                                  </span>
                                );
                              })}
                              <span className="flex h-11 items-center justify-end">
                                <button
                                  type="submit"
                                  formAction={moveMovement.bind(null, movement.id, -1)}
                                  aria-label="Move up"
                                  disabled={index === 0}
                                  className="h-11 w-6 text-muted disabled:opacity-30"
                                >
                                  ↑
                                </button>
                                <button
                                  type="submit"
                                  formAction={moveMovement.bind(null, movement.id, 1)}
                                  aria-label="Move down"
                                  disabled={index === block.movements.length - 1}
                                  className="h-11 w-6 text-muted disabled:opacity-30"
                                >
                                  ↓
                                </button>
                                <button
                                  type="submit"
                                  formAction={deleteMovement.bind(null, movement.id)}
                                  aria-label="Remove movement"
                                  className="h-11 w-7 text-[17px] text-muted hover:text-ink"
                                >
                                  ×
                                </button>
                              </span>
                            </AutoSaveForm>
                          );
                        })}

                        {/* The next movement: a whole blank line, laid out
                            like the ones above, sent by "+ Movement" below. */}
                        <form
                          id={`add-${block.id}`}
                          action={addMovement.bind(null, block.id)}
                          className="grid items-end gap-2"
                          style={{ gridTemplateColumns: grid }}
                        >
                          {hidden}
                          <input
                            name="reps"
                            type="number"
                            min={1}
                            placeholder={block.format === "LADDER" ? "" : "–"}
                            aria-label={`Reps of the new movement in block ${LETTERS[blockIndex]}`}
                            // A ladder's reps come from its scheme.
                            disabled={block.format === "LADDER"}
                            className="font-display num h-11 w-full rounded-lg border border-dashed border-[#CEC8BA] bg-card text-center text-[19px] font-bold outline-none focus:border-solid focus:border-ink disabled:bg-paper"
                          />
                          <input
                            name="name"
                            placeholder={block.movements.length === 0 ? "First movement" : "Next movement"}
                            aria-label={`New movement in block ${LETTERS[blockIndex]}`}
                            className="h-11 w-full rounded-lg border border-dashed border-[#CEC8BA] bg-card px-3 text-[15px] font-semibold outline-none focus:border-solid focus:border-ink"
                          />
                          <select
                            name="implement"
                            defaultValue="OTHER"
                            aria-label={`What the new movement in block ${LETTERS[blockIndex]} is done on`}
                            className="h-11 rounded-lg border border-dashed border-[#CEC8BA] bg-card px-1.5 text-[13px] font-semibold outline-none focus:border-solid focus:border-ink"
                          >
                            {IMPLEMENTS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {teams ? (
                            // Flips with the tickbox inside it, in CSS: this
                            // line is not saved, and so not redrawn, until
                            // "+ Movement" is pressed.
                            <label className="group flex h-11 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[#CEC8BA] bg-card text-[12px] font-bold has-checked:border-solid has-checked:border-(--brand-secondary) has-checked:bg-(--brand-secondary) has-checked:text-white">
                              <input type="checkbox" name="shared" className="sr-only" />
                              <span className="group-has-checked:hidden">Each athlete</span>
                              <span className="hidden group-has-checked:inline">Shared</span>
                            </label>
                          ) : (
                            <span className="flex h-11 items-center justify-center text-[13px] text-[#A39D8F]">
                              Each athlete
                            </span>
                          )}
                          {columns.map((column) =>
                            // A mixed team's load only means something when it
                            // is shared; set it on the row once it is.
                            column.sharedOnly ? (
                              <span key={column.field} />
                            ) : (
                              <input
                                key={column.field}
                                name={column.field}
                                aria-label={`Load of the new movement in block ${LETTERS[blockIndex]}, ${column.each}`}
                                placeholder="–"
                                className="num h-11 w-full rounded-lg border border-dashed border-[#CEC8BA] bg-card px-1 text-center text-[14px] font-semibold outline-none focus:border-solid focus:border-ink"
                              />
                            ),
                          )}
                          <span />
                        </form>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-4">
                      {format.hasMovements && (
                        <button
                          type="submit"
                          form={`add-${block.id}`}
                          className="h-9 rounded-lg border border-dashed border-[#A39D8F] px-3 text-[14px] font-semibold"
                        >
                          + Movement
                        </button>
                      )}
                      <span className="ml-auto text-right text-[14px] text-muted">
                        {blockSummary(plan, teams)}
                      </span>
                    </div>
                  </section>
                );
              })}

              {/* One button per format, as in the design. */}
              <form className="flex flex-wrap items-center gap-2.5">
                {hidden}
                <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
                  Add block
                </span>
                {FORMAT_ORDER.map((id) => (
                  <button
                    key={id}
                    type="submit"
                    formAction={addBlock.bind(null, selected.id, divisionId, id)}
                    className="h-10 rounded-lg border border-dashed border-[#A39D8F] px-3.5 text-[14px] font-semibold"
                  >
                    + {FORMATS[id].label}
                  </button>
                ))}
              </form>
            </div>

            {/* Ranking and tiebreak. */}
            <div className="mt-auto flex flex-wrap items-center gap-6 border-t border-line pt-3.5">
              <span className="flex items-center gap-2.5">
                <span className="text-[15px] font-semibold">Ranking</span>
                <span className="rounded-md bg-[#E9E4D8] px-2.5 py-1.5 text-[14px] font-semibold">
                  {scoring.ranking}
                </span>
              </span>
              {selected.blocks.length > 0 && (
                <AutoSaveForm
                  key={`tiebreak-${selected.id}-${divisionId}-${selected.tiebreakBlockId}`}
                  action={updateEvent}
                  className="flex items-center gap-2.5"
                >
                  {hidden}
                  <input type="hidden" name="eventId" value={selected.id} />
                  <span className="text-[15px] font-semibold">Tiebreak</span>
                  <span className="text-[14px] text-muted">Time at the end of block</span>
                  <select
                    name="tiebreakBlockId"
                    defaultValue={selected.blocks[tiebreakIndex]?.id ?? ""}
                    aria-label="Tiebreak block"
                    className="h-9 rounded-lg border border-[#CEC8BA] bg-card px-2 text-[14px] font-bold outline-none focus:border-ink"
                  >
                    <option value="">None</option>
                    {selected.blocks.map((block, index) => (
                      <option key={block.id} value={block.id}>
                        {LETTERS[index]}
                      </option>
                    ))}
                  </select>
                </AutoSaveForm>
              )}
              {competition.mode === "SCRAMBLE" && (
                <span className="ml-auto max-w-[430px] text-[14px] leading-[1.4] text-muted">
                  Shared loads: a 60+ team with one 60+ athlete gets halfway between its normal
                  and the 60+ load.
                </span>
              )}
              {fixedTeams && (
                <span className="ml-auto max-w-[430px] text-[14px] leading-[1.4] text-muted">
                  Shared loads are set per team type. No 60+ class in team competitions.
                </span>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
