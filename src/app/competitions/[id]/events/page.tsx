import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { IMPLEMENTS } from "@/components/implement";
import { INDIVIDUAL_LOADS, TEAM_LOADS } from "@/lib/heats";
import {
  addEvent,
  updateEvent,
  addMovement,
  updateMovement,
  deleteMovement,
  moveMovement,
  deleteEvent,
} from "@/lib/actions";
import { formatTime, type ScoreType } from "@/lib/score-format";
import { Field, inputClass } from "@/components/ui";
import { AutoSaveForm } from "@/components/auto-save-form";

/**
 * The event builder, from Events.dc.html.
 *
 * Events down the left, the selected one on the right: how it is scored, and
 * the movements that make it up. Writing the movements down is what lets a
 * capped result be entered as "reps into wall balls" and totalled by the app,
 * instead of the scorekeeper adding it up between heats.
 */

export const dynamic = "force-dynamic";

const SCORE_TYPES: { id: ScoreType; label: string; desc: string }[] = [
  { id: "TIME", label: "Time", desc: "Everyone finishes. Fastest wins." },
  { id: "TIME_OR_REPS", label: "Time or reps", desc: "For time with a cap. Capped = reps." },
  { id: "REPS", label: "Reps", desc: "Max reps in a set time." },
  { id: "WEIGHT", label: "Max kg", desc: "Heaviest lift in the window." },
  { id: "ROUNDS_REPS", label: "Rounds + reps", desc: "AMRAP. Reps per round counted." },
];

/**
 * The four load boxes.
 *
 * What each one means depends on the movement's own load mode, which is set
 * per row — so the heading carries both readings, and each box says which it
 * is for its own row. See `loadColumns` in `@/lib/heats`.
 */
const LOAD_COLUMNS = INDIVIDUAL_LOADS.map((column, index) => ({
  field: column.field,
  /** What the box holds when everybody lifts their own. */
  each: column.label,
  /** What it holds when the team shares one. */
  shared: TEAM_LOADS[index].label,
}));

export default async function EventBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const { id } = await params;
  const { event: wantedEvent } = await searchParams;

  const competition = await db.competition.findUnique({
    where: { id },
    include: {
      events: {
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: { movements: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!competition) notFound();

  const selected =
    competition.events.find((e) => e.id === wantedEvent) ?? competition.events[0];

  // 60+ is only a thing outside fixed teams, per the competition rules.
  const columns = LOAD_COLUMNS.filter(
    (column) => column.field !== "loadSixtyPlus" || competition.mode !== "FIXED_TEAM",
  );

  const totalReps = selected?.movements.reduce((sum, m) => sum + m.reps, 0) ?? 0;

  return (
    <div className="-mx-4 -my-6">
      <header className="flex h-[72px] items-center justify-between border-b border-line bg-card px-8">
        <div className="flex items-center gap-4">
          <span className="font-display text-lg font-bold uppercase">{competition.name}</span>
          <span className="h-8 w-px bg-line" />
          <span className="text-[15px] text-muted">Events</span>
        </div>
        <Link
          href={`/competitions/${competition.id}`}
          className="flex h-11 items-center rounded-lg border border-line bg-card px-4 font-semibold"
        >
          Done
        </Link>
      </header>

      <div className="flex min-h-0 flex-col lg:flex-row">
        <nav className="flex shrink-0 flex-col gap-2 border-b border-line p-5 lg:w-[300px] lg:border-b-0 lg:border-r">
          <span className="px-1 pb-1 text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            Events
          </span>

          {competition.events.map((event, index) => {
            const isSelected = event.id === selected?.id;
            return (
              <Link
                key={event.id}
                href={`/competitions/${competition.id}/events?event=${event.id}`}
                className="flex items-start gap-3 rounded-xl p-3"
                style={{
                  background: isSelected ? "var(--paper)" : "var(--card)",
                  border: `2px solid ${isSelected ? "var(--brand-primary)" : "transparent"}`,
                }}
              >
                <span
                  className="font-display num text-[20px] font-bold"
                  style={{ color: isSelected ? "var(--brand-primary)" : "#A39D8F" }}
                >
                  {index + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[16px] font-semibold">{event.name}</span>
                  <span className="text-[13px] text-muted">
                    {SCORE_TYPES.find((t) => t.id === event.scoreType)?.label}
                    {event.timeCapSeconds ? ` · cap ${formatTime(event.timeCapSeconds)}` : ""}
                    {event.movements.length > 0 ? ` · ${event.movements.length} movements` : ""}
                  </span>
                </span>
              </Link>
            );
          })}

          <form action={addEvent} className="mt-2 flex flex-col gap-2 rounded-xl border border-line p-3">
            <input type="hidden" name="competitionId" value={competition.id} />
            <input type="hidden" name="scoreType" value="TIME" />
            <Field label="Add an event">
              <input name="name" placeholder="Event 5 — Finale" className={inputClass} />
            </Field>
            <button
              type="submit"
              className="flex h-11 items-center justify-center rounded-lg border border-line bg-card font-semibold"
            >
              Add
            </button>
          </form>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col gap-6 px-6 py-7 lg:px-10">
          {!selected && (
            <p className="text-[15px] text-muted">
              No events yet. Add one on the left to start building it.
            </p>
          )}

          {selected && (
            <>
              {/* Name, how it is scored, and the cap. */}
              <form action={updateEvent} className="flex flex-col gap-5">
                <input type="hidden" name="competitionId" value={competition.id} />
                <input type="hidden" name="eventId" value={selected.id} />

                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-64 flex-1">
                    <Field label="Workout name">
                      <input
                        name="name"
                        defaultValue={selected.name}
                        className={`${inputClass} font-display h-14 text-[28px] font-bold uppercase`}
                      />
                    </Field>
                  </div>
                  {/* Part of the same form; a form cannot contain another. */}
                  <button
                    type="submit"
                    formAction={deleteEvent.bind(null, selected.id)}
                    className="h-11 px-2 text-[13px] text-muted hover:text-ink"
                  >
                    Delete event
                  </button>
                </div>

                <div className="flex flex-col gap-2.5">
                  <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
                    How is it scored?
                  </span>
                  <div className="grid gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
                    {SCORE_TYPES.map((type) => {
                      const chosen = selected.scoreType === type.id;
                      return (
                        <label
                          key={type.id}
                          className="flex cursor-pointer flex-col gap-1 rounded-xl p-3.5"
                          style={{
                            border: `2px solid ${chosen ? "var(--ink)" : "var(--line)"}`,
                            background: chosen ? "var(--ink)" : "var(--card)",
                            color: chosen ? "#fff" : "var(--ink)",
                          }}
                        >
                          <input
                            type="radio"
                            name="scoreType"
                            value={type.id}
                            defaultChecked={chosen}
                            className="sr-only"
                          />
                          <span className="text-[16px] font-semibold">{type.label}</span>
                          <span className="text-[13px] leading-[1.35] opacity-80">{type.desc}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-4">
                  <div className="w-48">
                    <Field label="Time cap in minutes">
                      <input
                        name="timeCapMinutes"
                        type="number"
                        min={1}
                        defaultValue={
                          selected.timeCapSeconds ? selected.timeCapSeconds / 60 : ""
                        }
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  {selected.scoreType === "ROUNDS_REPS" && (
                    // Worked out from the movements below, never typed in.
                    <div className="w-56">
                      <Field label="Reps per round">
                        <div className="flex h-11 items-center gap-2 rounded-lg border border-dashed border-line px-3 text-[15px]">
                          {selected.repsPerRound ? (
                            <>
                              <span className="num font-semibold">{selected.repsPerRound}</span>
                              <span className="text-muted">from the movements</span>
                            </>
                          ) : (
                            <span className="text-muted">Add the movements below</span>
                          )}
                        </div>
                      </Field>
                    </div>
                  )}
                  <button
                    type="submit"
                    className="flex h-11 items-center rounded-lg px-5 font-semibold text-white"
                    style={{ background: "var(--brand-primary)" }}
                  >
                    Save event
                  </button>
                </div>
              </form>

              {/* The movements that make up the workout. */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
                    The workout
                  </span>
                  {totalReps > 0 && (
                    <span className="font-display num text-[15px] font-bold text-muted">
                      {totalReps} reps in total
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-line bg-card">
                  <div
                    className="grid gap-2 border-b border-line px-4 py-2 text-[12px] font-semibold uppercase tracking-[.06em] text-muted"
                    style={{
                      gridTemplateColumns: `56px minmax(120px,1fr) 104px 100px repeat(${columns.length}, 72px) 76px`,
                      minWidth: 800,
                    }}
                  >
                    <span>Reps</span>
                    <span>Movement</span>
                    <span>On</span>
                    <span>Load</span>
                    {columns.map((column) => (
                      <span key={column.field} className="flex flex-col leading-tight">
                        <span>{column.each}</span>
                        <span className="text-[10px] font-medium normal-case opacity-55">
                          {column.shared}
                        </span>
                      </span>
                    ))}
                    <span />
                  </div>

                  {selected.movements.map((movement, index) => (
                    <AutoSaveForm
                      key={movement.id}
                      action={updateMovement.bind(null, movement.id)}
                      className="grid items-center gap-2 border-b border-[#EFEADF] px-4 py-2.5 last:border-0"
                      style={{
                        gridTemplateColumns: `56px minmax(120px,1fr) 104px 100px repeat(${columns.length}, 72px) 76px`,
                        minWidth: 800,
                      }}
                    >
                      <input type="hidden" name="competitionId" value={competition.id} />

                      <input
                        name="reps"
                        type="number"
                        min={1}
                        defaultValue={movement.reps}
                        aria-label="Reps"
                        className="font-display num h-11 w-full rounded-lg border border-[#CEC8BA] bg-card text-center text-[20px] font-bold outline-none focus:border-ink"
                      />
                      <input
                        name="name"
                        defaultValue={movement.name}
                        aria-label="Movement"
                        className={`${inputClass} text-[16px] font-semibold`}
                      />

                      {/* Plates are only shown for a barbell; a sandbag
                          simply weighs what it weighs. */}
                      <select
                        name="implement"
                        defaultValue={movement.implement}
                        aria-label="What the load is on"
                        className="h-11 rounded-lg border border-[#CEC8BA] bg-card px-1.5 text-[13px] font-semibold outline-none focus:border-ink"
                      >
                        {IMPLEMENTS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      {/* Everyone lifts their own, or the team shares one. */}
                      <label
                        className="flex h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-[13px] font-semibold"
                        style={{
                          border: `1px solid ${movement.loadMode === "SHARED" ? "var(--brand-secondary)" : "#CEC8BA"}`,
                          background:
                            movement.loadMode === "SHARED" ? "var(--brand-secondary)" : "var(--card)",
                          color: movement.loadMode === "SHARED" ? "#fff" : "var(--ink)",
                        }}
                      >
                        <input
                          type="checkbox"
                          name="shared"
                          defaultChecked={movement.loadMode === "SHARED"}
                          className="sr-only"
                        />
                        {movement.loadMode === "SHARED" ? "Shared by team" : "Each athlete"}
                      </label>

                      {columns.map((column) => {
                        const label =
                          movement.loadMode === "SHARED" ? column.shared : column.each;
                        return (
                        <input
                          key={column.field}
                          name={column.field}
                          defaultValue={movement[column.field] ?? ""}
                          aria-label={`${label} load`}
                          title={`${label} load`}
                          placeholder={label}
                          className="h-11 w-full rounded-lg border border-[#CEC8BA] bg-card px-2 text-center text-[14px] font-semibold outline-none focus:border-ink"
                        />
                        );
                      })}

                      {/* No Save button: the row writes itself, as score entry does. */}
                      <span className="flex items-center justify-end gap-1">
                        <button
                          type="submit"
                          formAction={moveMovement.bind(null, movement.id, -1)}
                          aria-label="Move up"
                          disabled={index === 0}
                          className="h-11 px-1 text-muted disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="submit"
                          formAction={moveMovement.bind(null, movement.id, 1)}
                          aria-label="Move down"
                          disabled={index === selected.movements.length - 1}
                          className="h-11 px-1 text-muted disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="submit"
                          formAction={deleteMovement.bind(null, movement.id)}
                          aria-label="Remove movement"
                          className="h-11 px-1 text-muted hover:text-ink"
                        >
                          ×
                        </button>
                      </span>
                    </AutoSaveForm>
                  ))}

                  {selected.movements.length === 0 && (
                    <p className="px-4 py-4 text-[15px] text-muted">
                      No movements yet. Add the first line of the workout below.
                    </p>
                  )}
                </div>

                <form
                  action={addMovement}
                  className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4"
                >
                  <input type="hidden" name="competitionId" value={competition.id} />
                  <input type="hidden" name="eventId" value={selected.id} />
                  <div className="w-24">
                    <Field label="Reps">
                      <input name="reps" type="number" min={1} defaultValue={1} className={inputClass} />
                    </Field>
                  </div>
                  <div className="min-w-40 flex-1">
                    <Field label="Movement">
                      <input name="name" placeholder="Wall balls" className={inputClass} />
                    </Field>
                  </div>
                  <div className="w-32">
                    <Field label="On">
                      <select name="implement" defaultValue="BARBELL" className={inputClass}>
                        {IMPLEMENTS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {columns.map((column) => (
                    <div key={column.field} className="w-24">
                      {/* Which reading applies depends on the Shared box
                          below, so this form names both. */}
                      <Field label={`${column.each} / ${column.shared}`}>
                        <input name={column.field} placeholder="—" className={inputClass} />
                      </Field>
                    </div>
                  ))}
                  <label className="flex h-11 cursor-pointer items-center gap-2 text-[14px] font-semibold">
                    <input type="checkbox" name="shared" className="h-5 w-5" />
                    Shared
                  </label>
                  <button
                    type="submit"
                    className="flex h-11 items-center rounded-lg border border-line bg-card px-4 font-semibold"
                  >
                    Add movement
                  </button>
                </form>

                <p className="text-[14px] text-muted">
                  Loads are written as they are said: &ldquo;9 kg&rdquo;, &ldquo;60 cm&rdquo;. Leave
                  a box empty where a movement has no load.
                </p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
