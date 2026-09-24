import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  saveBasics,
  saveScoringRules,
  saveFormat,
  saveSharing,
  addAthleteInSetup,
  addEventInSetup,
  deleteAthlete,
  deleteTeam,
  takeOffTeam,
  type SetupNote,
} from "@/lib/actions";
import { pointsForPlace, describeTieRule, type PointsSystem } from "@/lib/scoring";
import { Field, inputClass } from "@/components/ui";
import { ClosablePanel } from "@/components/closable-panel";
import { FORMATS, type BlockFormat } from "@/lib/workout";
import { formatTime } from "@/lib/score-format";

/**
 * The setup wizard, from Main.dc.html.
 *
 * Six steps down the left. The competition is created as a draft as soon as
 * the wizard opens, so each step can save on its way out and a half-finished
 * setup survives closing the laptop. Every step is a single form: Continue and
 * the steps in the left-hand list are all submit buttons, so jumping around
 * never loses what was just typed.
 */

export const dynamic = "force-dynamic";

const STEPS = [
  "The basics",
  "Scoring rules",
  "Format & teams",
  "Athletes",
  "Events",
  "Screens & sharing",
];

export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string; added?: string; skipped?: string }>;
}) {
  const { id } = await params;
  const { step: rawStep, added, skipped } = await searchParams;
  const step = Math.max(0, Math.min(5, Number(rawStep ?? 0) || 0));

  const competition = await db.competition.findUnique({
    where: { id },
    include: {
      divisions: { orderBy: { position: "asc" } },
      athletes: {
        orderBy: { name: "asc" },
        include: { division: true, memberships: { where: { team: { eventId: null } } } },
      },
      events: {
        orderBy: { position: "asc" },
        include: {
          _count: { select: { movements: true } },
          blocks: { orderBy: { position: "asc" }, select: { format: true } },
        },
      },
      teams: {
        where: { eventId: null },
        orderBy: { name: "asc" },
        include: {
          division: true,
          members: { include: { athlete: true }, orderBy: { athlete: { name: "asc" } } },
        },
      },
    },
  });
  if (!competition) notFound();

  // Who the last save could not add for want of their sex; see
  // rememberForSetup in actions.ts.
  const rawNote = (await cookies()).get("setup-note")?.value;
  let note: SetupNote | null = null;
  try {
    note = rawNote ? (JSON.parse(rawNote) as SetupNote) : null;
  } catch {
    note = null;
  }

  const action = [
    saveBasics,
    saveScoringRules,
    saveFormat,
    addAthleteInSetup,
    addEventInSetup,
    saveSharing,
  ][step];

  return (
    <div className="-mx-4 -my-6">
      <header className="flex h-[72px] items-center justify-between border-b border-line bg-card px-8">
        <div className="flex items-center gap-4">
          <span className="font-display text-lg font-bold uppercase">
            {competition.name || "New competition"}
          </span>
          <span className="h-8 w-px bg-line" />
          <span className="text-[15px] text-muted">
            {competition.events.length === 0 ? "Draft" : "Setup"}
          </span>
        </div>
        <Link
          href={`/competitions/${competition.id}`}
          className="flex h-11 items-center rounded-lg border border-line bg-card px-4 font-semibold"
        >
          Leave setup
        </Link>
      </header>

      <form action={action} className="flex min-h-0 flex-col lg:flex-row">
        <input type="hidden" name="competitionId" value={competition.id} />

        <nav className="flex shrink-0 flex-col gap-1.5 border-b border-line p-5 lg:w-[270px] lg:border-b-0 lg:border-r">
          <span className="px-3 pb-2 text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            Set up
          </span>
          {STEPS.map((label, index) => (
            <button
              key={label}
              type="submit"
              name="goto"
              value={index}
              className="flex h-13 items-center gap-3 rounded-[10px] px-3 text-left text-[16px]"
              style={{
                height: 52,
                background: index === step ? "var(--card)" : "transparent",
                fontWeight: index === step ? 600 : 500,
              }}
            >
              <span
                className="font-display num flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-bold"
                style={{
                  background:
                    index === step
                      ? "var(--brand-primary)"
                      : index < step
                        ? "var(--ink)"
                        : "var(--line)",
                  color: index <= step ? "#fff" : "var(--muted)",
                }}
              >
                {index + 1}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <main className="flex min-w-0 flex-1 flex-col gap-6 px-6 py-8 lg:px-11">
          {step === 0 && <Basics competition={competition} />}
          {step === 1 && <ScoringRules competition={competition} />}
          {step === 2 && <Format competition={competition} />}
          {step === 3 && (
            <Athletes
              competition={competition}
              pasted={added === undefined ? null : { added: Number(added), skipped: Number(skipped ?? 0) }}
              note={note}
            />
          )}
          {step === 4 && <Events competition={competition} />}
          {step === 5 && <Sharing competition={competition} />}

          <div className="mt-auto flex justify-between gap-3 border-t border-line pt-5">
            <button
              type="submit"
              name="goto"
              value={Math.max(0, step - 1)}
              className="flex items-center rounded-lg border border-line bg-card px-6 font-semibold"
              style={{ height: 52, visibility: step === 0 ? "hidden" : "visible" }}
            >
              ← Back
            </button>
            <button
              type="submit"
              name="goto"
              value={step === 5 ? "" : step + 1}
              className="flex items-center rounded-lg px-7 font-semibold text-white"
              style={{ height: 52, background: "var(--brand-primary)" }}
            >
              {step === 5 ? "Finish setup" : "Continue"} →
            </button>
          </div>
        </main>
      </form>
    </div>
  );
}

type Athlete = {
  id: string;
  name: string;
  isSixtyPlus: boolean;
  gender: string | null;
  division?: { name: string } | null;
};

type Competition = NonNullable<
  Awaited<ReturnType<typeof db.competition.findUnique>>
> & {
  divisions: { id: string; name: string }[];
  athletes: (Athlete & { memberships: unknown[] })[];
  teams: {
    id: string;
    name: string;
    divisionId: string | null;
    division: { name: string } | null;
    members: { athlete: Athlete }[];
  }[];
  events: {
    id: string;
    name: string;
    timeCapSeconds: number | null;
    _count: { movements: number };
    blocks: { format: BlockFormat }[];
  }[];
};

function Heading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="font-display text-[40px] font-bold uppercase leading-none">{title}</h1>
      <p className="text-[17px] text-muted">{blurb}</p>
    </div>
  );
}

/** A big selectable card. Uses a radio so it works without any JavaScript. */
/**
 * Four athletes, drawn as dots, showing what a format does with them.
 *
 * Individuals stand apart and all look the same. A scramble's pairs are two
 * colours mixed together, because the pairing changes. A fixed team's two
 * pairs each keep one colour all day. The gap is what makes a pair a pair.
 */
function Dots({ dots }: { dots: { colour: string; apart: boolean }[] }) {
  return (
    <span aria-hidden className="flex h-5 items-center gap-1.5">
      {dots.map((dot, index) => (
        <span
          key={index}
          className="h-3.5 w-3.5 rounded-full"
          style={{ background: dot.colour, marginRight: dot.apart ? 10 : 0 }}
        />
      ))}
    </span>
  );
}

function ChoiceCard({
  name,
  value,
  checked,
  title,
  desc,
  note,
  dots,
}: {
  name: string;
  value: string;
  checked: boolean;
  title: string;
  desc: string;
  note?: string;
  /** Only the format cards have these; see `Dots`. */
  dots?: { colour: string; apart: boolean }[];
}) {
  return (
    <label
      // The chosen outline comes from CSS, not from `checked`, so it follows
      // the click rather than the last save. See `.choice` in globals.css.
      className={`choice flex cursor-pointer flex-col rounded-xl border-2 border-line bg-card p-[18px] ${
        dots ? "gap-3" : "gap-2"
      }`}
    >
      <input type="radio" name={name} value={value} defaultChecked={checked} className="sr-only" />
      {dots && <Dots dots={dots} />}
      {dots ? (
        <span className="font-display text-[22px] font-bold uppercase leading-none">{title}</span>
      ) : (
        <span className="text-[17px] font-semibold">{title}</span>
      )}
      <span className="text-[15px] leading-[1.4] text-muted">{desc}</span>
      {note && (
        <span className="self-start rounded-md bg-paper px-2 py-1 text-[13px] font-semibold">
          {note}
        </span>
      )}
    </label>
  );
}

function Basics({ competition }: { competition: Competition }) {
  const date = competition.date
    ? new Date(competition.date).toISOString().slice(0, 10)
    : "";
  return (
    <div className="flex max-w-[760px] flex-col gap-7">
      <Heading title="The basics" blurb="Name it and date it." />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Competition name">
            <input
              name="name"
              defaultValue={competition.name}
              placeholder="Holger Scramble 2026"
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Date">
          <input type="date" name="date" defaultValue={date} className={inputClass} />
        </Field>
        <Field label="Venue">
          <input
            name="venue"
            defaultValue={competition.venue ?? ""}
            placeholder="Holger, Skurup"
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}

function ScoringRules({ competition }: { competition: Competition }) {
  // Show the ladder against however many are signed up, or a sensible sample.
  const entries = Math.max(competition.athletes.length, 6);
  const system = competition.pointsSystem as PointsSystem;
  const step = Math.floor(100 / entries);
  const places = Array.from({ length: Math.min(entries, 12) }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-6">
      <Heading
        title="Scoring rules"
        blurb="How placings turn into points, and what happens with ties and no-shows."
      />

      <div className="flex flex-col gap-2.5">
        <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
          Points per event
        </span>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <ChoiceCard
            name="pointsSystem"
            value="HUNDRED_STEPS"
            checked={system === "HUNDRED_STEPS"}
            title="100 points, even steps"
            desc="Winner gets 100, every place below drops by the same amount. Highest total wins. A no-show scores 0."
          />
          <ChoiceCard
            name="pointsSystem"
            value="PLACING"
            checked={system === "PLACING"}
            title="Placing points"
            desc="1st = 1 point, 2nd = 2 points. Lowest total wins. A no-show gets last place + 1."
          />
        </div>
      </div>

      {/* What each place is actually worth, so the choice is not abstract. */}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[15px] font-semibold">
            {system === "HUNDRED_STEPS"
              ? `With ${entries} entries: steps of ${step} points`
              : `With ${entries} entries`}
          </span>
          <span className="text-[14px] text-muted">
            {competition.athletes.length > 0
              ? "Based on who has signed up so far"
              : "Example, until athletes are added"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {places.map((place) => (
            <div
              key={place}
              className="flex h-[54px] w-[60px] flex-col items-center justify-center rounded-lg"
              style={{
                background: place === 1 ? "var(--brand-primary)" : "var(--paper)",
                color: place === 1 ? "#fff" : "var(--ink)",
              }}
            >
              <span className="text-[11px] font-semibold opacity-80">
                {place}
                {ordinal(place)}
              </span>
              <span className="font-display num text-[22px] font-bold leading-none">
                {pointsForPlace(place, entries, system)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            Exactly the same score in an event
          </span>
          <div className="flex flex-col gap-1.5">
            {(["SHARE_HIGHER", "TIEBREAK_TIME", "SHARE_AVERAGE"] as const).map((rule) => (
              <label
                key={rule}
                className="choice-fill flex cursor-pointer flex-col gap-0.5 rounded-lg border border-line bg-card px-3.5 py-2 text-ink"
                style={{ minHeight: 44 }}
              >
                <input
                  type="radio"
                  name="eventTieRule"
                  value={rule}
                  defaultChecked={competition.eventTieRule === rule}
                  className="sr-only"
                />
                <span className="text-[15px] font-semibold">{tieLabel(rule)}</span>
                <span className="text-[13px] opacity-80">{describeTieRule(rule)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            Didn&apos;t show, or didn&apos;t finish
          </span>
          <div className="flex flex-col gap-1.5">
            <FixedRule
              title={system === "HUNDRED_STEPS" ? "No-show → 0 points" : "No-show → last place + 1"}
              desc='Mark them as "No-show" when entering scores.'
            />
            <FixedRule
              title="Started but stopped → capped"
              desc="Enter the reps they completed. They rank with the capped scores."
            />
            <FixedRule
              title="Tied overall → best single-event placing"
              desc="Then the next best, and so on."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A rule the organiser cannot change; shown so nothing is a surprise later. */
function FixedRule({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-card px-3.5 py-2" style={{ minHeight: 44 }}>
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="text-[13px] text-muted">{desc}</span>
    </div>
  );
}

function Format({ competition }: { competition: Competition }) {
  const teamSize = competition.teamSize ?? 2;
  const signedUp = competition.athletes.length;
  const full = signedUp === 0 || signedUp % teamSize === 0;

  // The sections below each belong to a format, and show while that format's
  // card is ticked — straight away, not after saving. See `.format-step` in
  // globals.css.
  return (
    <div className="format-step flex flex-col gap-6">
      <Heading title="Format & teams" blurb="Who works together, and who gets the points." />

      <div className="grid gap-3.5 sm:grid-cols-3">
        <ChoiceCard
          name="mode"
          value="INDIVIDUAL"
          checked={competition.mode === "INDIVIDUAL"}
          title="Individual"
          desc="Everyone works alone and scores for themselves."
          note="One leaderboard of athletes"
          dots={[
            { colour: "var(--ink)", apart: true },
            { colour: "var(--ink)", apart: true },
            { colour: "var(--ink)", apart: true },
            { colour: "var(--ink)", apart: false },
          ]}
        />
        <ChoiceCard
          name="mode"
          value="SCRAMBLE"
          checked={competition.mode === "SCRAMBLE"}
          title="Scramble"
          desc="New teams before every event. Each athlete keeps their own points."
          note="One leaderboard of athletes"
          dots={[
            { colour: "var(--brand-primary)", apart: false },
            { colour: "var(--brand-secondary)", apart: true },
            { colour: "var(--brand-secondary)", apart: false },
            { colour: "var(--brand-primary)", apart: false },
          ]}
        />
        <ChoiceCard
          name="mode"
          value="FIXED_TEAM"
          checked={competition.mode === "FIXED_TEAM"}
          title="Fixed teams"
          desc="Same team all day, sharing one score per event. RX and Scaled possible."
          note="One leaderboard per division"
          dots={[
            { colour: "var(--brand-primary)", apart: false },
            { colour: "var(--brand-primary)", apart: true },
            { colour: "var(--brand-secondary)", apart: false },
            { colour: "var(--brand-secondary)", apart: false },
          ]}
        />
      </div>

      <div data-for-mode="SCRAMBLE FIXED_TEAM" className="flex-wrap items-end gap-8">
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            Athletes per team
          </span>
          <div className="flex items-center rounded-lg border border-line bg-card">
            <input type="hidden" name="teamSize" value={teamSize} />
            <button
              type="submit"
              name="teamSizeDelta"
              value="-1"
              aria-label="Fewer per team"
              className="h-11 w-11 text-[22px]"
            >
              −
            </button>
            <span className="font-display num w-10 text-center text-[24px] font-bold">
              {teamSize}
            </span>
            <button
              type="submit"
              name="teamSizeDelta"
              value="1"
              aria-label="More per team"
              className="h-11 w-11 text-[22px]"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            Signed up so far
          </span>
          <div className="flex h-11 items-center rounded-lg border border-line bg-card px-4">
            <span className="font-display num text-[24px] font-bold">{signedUp}</span>
          </div>
        </div>

        {/* Teams must be full, so say so here rather than at the draw. */}
        <div
          className="flex min-h-12 flex-1 items-center gap-2.5 rounded-[10px] px-4 py-2.5 text-[15px] font-semibold"
          style={{
            background: full ? "#E7EFE1" : "#F6E7E1",
            color: full ? "#2E3D1F" : "#8A2A12",
          }}
        >
          {full
            ? signedUp === 0
              ? `Teams of ${teamSize}. Add athletes on the next step.`
              : `${signedUp} athletes make ${signedUp / teamSize} full teams of ${teamSize}.`
            : `${signedUp} athletes do not divide into teams of ${teamSize}. ${signedUp % teamSize} would be left over.`}
        </div>
      </div>

      {/* How heats run, whatever the format. */}
      <div data-for-mode="INDIVIDUAL SCRAMBLE FIXED_TEAM" className="flex-col gap-2.5">
        <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">Heats</span>
        <div className="flex flex-wrap items-end gap-6">
          <label className="flex flex-col gap-2.5">
            <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
              Lanes per heat
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
          <Pills
            label="Heat order"
            name="heatOrder"
            chosen={competition.heatOrder}
            options={[
              ["STANDING", "By standing, leaders last"],
              ["REVERSED", "By standing, leaders first"],
              ["RANDOM", "Random"],
            ]}
          />
        </div>
        <span className="text-[13px] text-muted">
          Random also means nobody from an event&apos;s last heat starts the next event.
        </span>
        {/* A scramble always keeps the last heat out of the next event's
            first, whatever the order. */}
        <span data-for-mode="SCRAMBLE" className="flex-col">
          <FixedRule
            title="Last heat doesn't start the next event"
            desc="Always, in a scramble: nobody from an event's last heat is in the next event's first."
          />
        </span>
      </div>

      <div data-for-mode="SCRAMBLE" className="flex-col gap-6">
          <div className="flex flex-col gap-2.5">
            <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
              How are teams drawn before each event?
            </span>
            <div className="grid gap-3 sm:grid-cols-3">
              <ChoiceCard name="drawMethod" value="RANDOM" checked={competition.drawMethod === "RANDOM"} title="Random" desc="Pure chance, drawn fresh each event." />
              <ChoiceCard name="drawMethod" value="SNAKE" checked={competition.drawMethod === "SNAKE"} title="Best + worst" desc="Rank by standing, pair the top with the bottom." />
              <ChoiceCard name="drawMethod" value="HALVES" checked={competition.drawMethod === "HALVES"} title="Top + bottom half" desc="One from each half of the standings." />
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Pills
              label="Teammates"
              name="teammateRule"
              chosen={competition.teammateRule}
              options={[
                ["ALWAYS_DIFFERENT", "Always different"],
                ["AVOID_REPEATS", "Avoid repeats"],
                ["ALLOW_REPEATS", "Repeats allowed"],
              ]}
            />
            <Pills
              label="Sex in the draw"
              name="drawGender"
              chosen={competition.drawGender}
              options={[
                ["IGNORE", "Ignore"],
                ["MIXED", "Mixed pairs"],
                ["SAME", "Same sex"],
              ]}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-card px-4 py-3">
            <input
              type="checkbox"
              name="spreadSixtyPlus"
              defaultChecked={competition.spreadSixtyPlus}
              className="h-5 w-5"
            />
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold">Spread 60+ athletes across teams</span>
              <span className="text-[13px] text-muted">
                Stops them clumping together in the draw. 60+ is not a division.
              </span>
            </span>
          </label>
      </div>

      <div data-for-mode="FIXED_TEAM" className="flex-col gap-2.5">
          <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            Where do the teams come from?
          </span>
          <div className="grid gap-3.5 sm:grid-cols-3">
            <ChoiceCard name="fixedTeamSource" value="SIGNUP" checked={competition.fixedTeamSource === "SIGNUP"} title="Chosen at signup" desc="Athletes sign up as a team." />
            <ChoiceCard name="fixedTeamSource" value="DRAWN" checked={competition.fixedTeamSource === "DRAWN"} title="Drawn once" desc="Random draw at the start, then fixed." />
            <ChoiceCard name="fixedTeamSource" value="BALANCED" checked={competition.fixedTeamSource === "BALANCED"} title="Balanced once" desc="Best with worst by seed, then fixed." />
          </div>
      </div>
    </div>
  );
}

function Pills({
  label,
  name,
  chosen,
  options,
}: {
  label: string;
  name: string;
  chosen: string | null;
  options: [string, string][];
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map(([value, text]) => (
          <label
            key={value}
            className="choice-fill flex cursor-pointer items-center rounded-full border border-line bg-card px-4 text-[15px] font-semibold text-ink"
            style={{ height: 44 }}
          >
            <input
              type="radio"
              name={name}
              value={value}
              defaultChecked={chosen === value}
              className="sr-only"
            />
            {text}
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * "Paste a list" opens a box under the button. Its text is saved by whichever
 * button is pressed next — Continue as well as "Add these" — and emptied if
 * the box is closed instead.
 */
function Athletes({
  competition,
  pasted,
  note,
}: {
  competition: Competition;
  pasted: { added: number; skipped: number } | null;
  note: SetupNote | null;
}) {
  const signupTeams =
    competition.mode === "FIXED_TEAM" && competition.fixedTeamSource === "SIGNUP";
  return (
    <div className="flex flex-col gap-6">
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <Heading
          title="Athletes"
          blurb={
            signupTeams
              ? "Athletes sign up as a team. Add each team, then who is on it."
              : "Everyone taking part. 60+ changes the loads, not the leaderboard."
          }
        />
        <ClosablePanel
          summary="Paste a list"
          summaryClassName="flex h-11 items-center rounded-lg border border-line bg-card px-[18px] font-semibold group-open:bg-paper"
        >
          <div className="absolute right-0 top-full z-10 mt-2 flex w-full max-w-[560px] flex-col gap-3 rounded-xl border border-line bg-card p-4 shadow-lg">
            <label htmlFor="athlete-list" className="text-[15px] font-semibold">
              One athlete per line
            </label>
            <textarea
              id="athlete-list"
              name="list"
              data-autofocus
              rows={8}
              defaultValue={note?.keepList ?? ""}
              placeholder={"Anna Lastname, W, 60+\nJonas Lastname, M\nEva Lastname"}
              className="rounded-lg border border-line bg-card p-3 text-[16px] leading-relaxed"
            />
            <p className="text-[14px] text-muted">
              After the name, add W or M and 60+ if you know them, separated by
              commas.{competition.mode === "FIXED_TEAM" && " A division name works the same way."}{" "}
              Rows copied from a spreadsheet work too. Anyone already on the
              list is left out.
              {signupTeams && " Everyone pasted waits under “Not on a team yet” until you put them on one."}
              {" "}A line without W or M is left out: everyone&apos;s sex has to be set.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                data-close
                className="flex h-11 items-center rounded-lg border border-line bg-card px-5 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex h-11 items-center rounded-lg px-5 font-semibold text-white"
                style={{ background: "var(--brand-primary)" }}
              >
                Add these
              </button>
            </div>
          </div>
        </ClosablePanel>
      </div>

      {note?.needDivision && (
        <p
          role="alert"
          className="rounded-lg border border-[#C9A07A] bg-[#FBF3EA] px-4 py-3 text-[15px] text-[#6B3A0E]"
        >
          Not added: <strong>{note.needDivision}</strong> needs a division. A team only races
          its own division, so choose one and add it again.
        </p>
      )}

      {note && note.needSex.length > 0 && (
        <p
          role="alert"
          className="rounded-lg border border-[#C9A07A] bg-[#FBF3EA] px-4 py-3 text-[15px] text-[#6B3A0E]"
        >
          Not added, because their sex was not chosen: <strong>{note.needSex.join(", ")}</strong>.{" "}
          {note.keepList
            ? "Their lines are back in “Paste a list”: add W or M after each name."
            : "Choose W or M and add them again."}
        </p>
      )}

      {pasted && (
        <p role="status" className="rounded-lg border border-line bg-card px-4 py-3 text-[15px]">
          {pasted.added === 0
            ? "Nobody new to add."
            : `Added ${pasted.added} ${pasted.added === 1 ? "athlete" : "athletes"}.`}
          {pasted.skipped > 0 &&
            ` ${pasted.skipped} ${pasted.skipped === 1 ? "was" : "were"} already on the list.`}
        </p>
      )}

      {signupTeams ? (
        <TeamRoster competition={competition} keepTeamName={note?.needDivision ?? ""} />
      ) : (
        <AthleteList competition={competition} keepName={note?.keepName ?? ""} />
      )}
    </div>
  );
}

/** Everyone in one list, with a line to add one more. */
function AthleteList({ competition, keepName }: { competition: Competition; keepName: string }) {
  const count = competition.athletes.length;
  return (
    <>
      <div className="flex flex-col rounded-xl border border-line bg-card">
        {count > 0 && (
          <div className="border-b border-line px-5 py-3 text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
            {count} {count === 1 ? "athlete" : "athletes"}
          </div>
        )}
        {competition.athletes.length === 0 && (
          <p className="p-5 text-[15px] text-muted">Nobody signed up yet.</p>
        )}
        {competition.athletes.map((athlete) => (
          <div
            key={athlete.id}
            className="flex items-start justify-between gap-3 border-b border-[#EFEADF] px-5 py-3 last:border-0"
          >
            <EditableAthlete
              athlete={athlete}
              extra={
                athlete.division && (
                  <span className="text-[13px] text-muted">{athlete.division.name}</span>
                )
              }
            />
            <button
              type="submit"
              formAction={deleteAthlete.bind(null, athlete.id)}
              className="flex h-7 items-center text-[13px] text-muted hover:text-ink"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4">
        <div className="min-w-48 flex-1">
          <Field label="Name">
            <input name="name" placeholder="Anna Lastname" defaultValue={keepName} className={inputClass} />
          </Field>
        </div>
        <div className="w-32">
          <Field label="Sex">
            <select name="gender" className={inputClass} defaultValue="">
              <option value="">Choose…</option>
              <option value="WOMAN">Woman</option>
              <option value="MAN">Man</option>
            </select>
          </Field>
        </div>
        {competition.mode === "FIXED_TEAM" && (
          <div className="w-40">
            <Field label="Division">
              <select name="divisionId" className={inputClass} defaultValue="">
                <option value="">—</option>
                {competition.divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <label className="flex h-11 cursor-pointer items-center gap-2 text-[15px] font-semibold">
          <input type="checkbox" name="isSixtyPlus" className="h-5 w-5" />
          60+
        </label>
        <button
          type="submit"
          className="flex h-11 items-center rounded-lg border border-line bg-card px-4 font-semibold"
        >
          Add athlete
        </button>
      </div>
    </>
  );
}

/**
 * An athlete's name, which opens their details for correcting: a gender
 * forgotten when they were added, 60+, or a misspelt name. The changes are
 * saved by whichever button is pressed next, like everything on the step, and
 * undone if the box is closed instead.
 */
function EditableAthlete({
  athlete,
  extra,
  tall = false,
  noSixtyPlus = false,
}: {
  athlete: Athlete;
  extra?: ReactNode;
  /** Line the name up with the 44-pixel controls beside it. */
  tall?: boolean;
  /** Fixed teams have no 60+ class, so it is neither shown nor asked. */
  noSixtyPlus?: boolean;
}) {
  return (
    <ClosablePanel
      className="min-w-0 flex-1"
      summaryClassName={`flex w-fit flex-wrap items-center gap-2 rounded-md ${tall ? "min-h-11" : "min-h-7"}`}
      summary={
        <>
          <span
            title="Click to change"
            className="text-[16px] font-semibold decoration-muted decoration-dotted underline-offset-4 hover:underline group-open:underline"
          >
            {athlete.name}
          </span>
          <AthleteTags athlete={athlete} noSixtyPlus={noSixtyPlus} />
          {extra}
        </>
      }
    >
      <div className="mt-2 mb-1 flex flex-col gap-3 rounded-lg bg-paper p-3">
        <input type="hidden" name={`edit:${athlete.id}`} value="1" />
        <input
          name={`editName:${athlete.id}`}
          aria-label={`Name of ${athlete.name}`}
          defaultValue={athlete.name}
          className={inputClass}
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-32">
            <select
              name={`editGender:${athlete.id}`}
              aria-label={`Sex of ${athlete.name}`}
              defaultValue={athlete.gender ?? ""}
              data-autofocus
              className={inputClass}
            >
              {/* Only for someone with no sex yet: it can be set, not cleared. */}
              {!athlete.gender && <option value="">Choose…</option>}
              <option value="WOMAN">Woman</option>
              <option value="MAN">Man</option>
            </select>
          </div>
          {noSixtyPlus ? (
            // Kept as it is, in case the competition becomes a scramble again.
            <input
              type="hidden"
              name={`editSixtyPlus:${athlete.id}`}
              value={athlete.isSixtyPlus ? "on" : ""}
            />
          ) : (
            <label className="flex h-11 cursor-pointer items-center gap-2 text-[15px] font-semibold">
              <input
                type="checkbox"
                name={`editSixtyPlus:${athlete.id}`}
                defaultChecked={athlete.isSixtyPlus}
                className="h-5 w-5"
              />
              60+
            </label>
          )}
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              data-close
              className="flex h-11 items-center rounded-lg border border-line bg-card px-4 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex h-11 items-center rounded-lg px-4 font-semibold text-white"
              style={{ background: "var(--brand-primary)" }}
            >
              Save
            </button>
          </span>
        </div>
      </div>
    </ClosablePanel>
  );
}

/** The small W / M and 60+ tags after a name. */
function AthleteTags({ athlete, noSixtyPlus = false }: { athlete: Athlete; noSixtyPlus?: boolean }) {
  const tag = "rounded-md bg-paper px-2 py-0.5 text-[12px] font-semibold text-muted";
  return (
    <>
      {athlete.gender ? (
        <span className={tag}>
          {athlete.gender === "WOMAN" ? "W" : athlete.gender === "MAN" ? "M" : "—"}
        </span>
      ) : (
        // Easy to forget when adding someone quickly, and the draw and a fixed
        // team's class both depend on it.
        <span className="rounded-md border border-dashed border-[#C9A07A] px-2 py-0.5 text-[12px] font-semibold text-[#8A4B12]">
          Sex not set
        </span>
      )}
      {athlete.isSixtyPlus && !noSixtyPlus && <span className={tag}>60+</span>}
    </>
  );
}

/**
 * Fixed teams chosen at signup: the athletes arrive already in teams, so the
 * step is a card per team with its members, rather than one long list.
 *
 * Anyone pasted in, or added before the format was chosen, waits under
 * "Not on a team yet" until they are put on one.
 */
function TeamRoster({
  competition,
  keepTeamName,
}: {
  competition: Competition;
  keepTeamName: string;
}) {
  const teamSize = competition.teamSize ?? 2;
  const loose = competition.athletes.filter((athlete) => athlete.memberships.length === 0);
  const teams = competition.teams;
  const smallButton = "flex h-11 shrink-0 items-center rounded-lg border border-line bg-card px-4 font-semibold";
  const label = "text-[13px] font-semibold uppercase tracking-[.02em] text-muted";

  return (
    <>
      <p className={label}>
        {teams.length} {teams.length === 1 ? "team" : "teams"} of {teamSize} ·{" "}
        {competition.athletes.length} {competition.athletes.length === 1 ? "athlete" : "athletes"}
      </p>

      {teams.length > 0 && (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {teams.map((team) => {
            const count = team.members.length;
            const full = count >= teamSize;
            return (
              <section
                key={team.id}
                aria-label={team.name}
                className="flex flex-col rounded-xl border border-line bg-card"
              >
                <header className="flex flex-col gap-2 border-b border-line px-5 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="font-display text-[20px] font-bold uppercase">{team.name}</h2>
                    <span
                      className="num rounded-md px-2 py-0.5 text-[12px] font-semibold"
                      style={
                        count === teamSize
                          ? { background: "var(--brand-primary)", color: "#fff" }
                          : { background: "var(--paper)", color: "var(--muted)" }
                      }
                    >
                      {count} of {teamSize}
                    </span>
                    <button
                      type="submit"
                      formAction={deleteTeam.bind(null, team.id)}
                      className="ml-auto text-[13px] text-muted hover:text-ink"
                    >
                      Remove team
                    </button>
                  </div>
                  {competition.divisions.length > 0 && (
                    // The team races only this division. Saved by whichever
                    // button is pressed next, like everything on the step.
                    <span className="w-44">
                      <select
                        name={`teamDivision:${team.id}`}
                        defaultValue={team.divisionId ?? ""}
                        aria-label={`Division of ${team.name}`}
                        className={`h-9 w-full rounded-lg border bg-card px-2 text-[14px] font-semibold outline-none focus:border-ink ${
                          team.divisionId
                            ? "border-[#CEC8BA]"
                            : "border-dashed border-[#C9A07A] text-[#8A4B12]"
                        }`}
                      >
                        {!team.divisionId && <option value="">Choose division…</option>}
                        {competition.divisions.map((division) => (
                          <option key={division.id} value={division.id}>
                            {division.name}
                          </option>
                        ))}
                      </select>
                    </span>
                  )}
                </header>

                {team.members.map(({ athlete }) => (
                  <div
                    key={athlete.id}
                    className="flex items-start justify-between gap-3 border-b border-[#EFEADF] px-5 py-2.5"
                  >
                    <EditableAthlete athlete={athlete} noSixtyPlus />
                    <button
                      type="submit"
                      formAction={takeOffTeam.bind(null, athlete.id)}
                      className="flex h-7 shrink-0 items-center text-[13px] text-muted hover:text-ink"
                    >
                      Take off team
                    </button>
                  </div>
                ))}

                {count > teamSize && (
                  <p className="px-5 py-2.5 text-[14px] text-muted">
                    {count - teamSize} more than a team of {teamSize}.
                  </p>
                )}

                {!full && (
                  <div className="flex flex-col gap-2 px-5 py-3">
                    <input
                      name={`member:${team.id}`}
                      aria-label={`New athlete on ${team.name}`}
                      placeholder={`Add someone to ${team.name}`}
                      className={inputClass}
                    />
                    <div className="flex items-center gap-3">
                      <div className="w-28">
                        <select
                          name={`memberGender:${team.id}`}
                          aria-label={`Sex of the new athlete on ${team.name}`}
                          defaultValue=""
                          className={inputClass}
                        >
                          <option value="">Sex</option>
                          <option value="WOMAN">Woman</option>
                          <option value="MAN">Man</option>
                        </select>
                      </div>
                      <button type="submit" className={`${smallButton} ml-auto`}>
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4">
        <div className="min-w-48 flex-1">
          <Field label="Team name">
            <input
              name="newTeamName"
              placeholder="Barbell Babes"
              defaultValue={keepTeamName}
              className={inputClass}
            />
          </Field>
        </div>
        {competition.divisions.length > 0 && (
          <div className="w-40">
            <Field label="Division">
              <select name="newTeamDivisionId" className={inputClass} defaultValue="">
                <option value="">Choose…</option>
                {competition.divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <button type="submit" className={smallButton}>
          Add team
        </button>
      </div>

      {loose.length > 0 && (
        <section aria-label="Not on a team yet" className="flex flex-col gap-2.5">
          <h2 className={label}>Not on a team yet · {loose.length}</h2>
          <div className="flex flex-col rounded-xl border border-line bg-card">
            {loose.map((athlete) => (
              <div
                key={athlete.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EFEADF] px-5 py-2.5 last:border-0"
              >
                <EditableAthlete athlete={athlete} tall noSixtyPlus />
                <span className="flex flex-wrap items-center gap-2">
                  {teams.length === 0 ? (
                    <span className="text-[14px] text-muted">Add a team first</span>
                  ) : (
                    <>
                      <div className="w-52">
                        <select
                          name={`assign:${athlete.id}`}
                          aria-label={`Team for ${athlete.name}`}
                          defaultValue=""
                          className={inputClass}
                        >
                          <option value="">Choose a team…</option>
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                              {team.members.length >= teamSize ? " (full)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button type="submit" className={smallButton}>
                        Put on team
                      </button>
                    </>
                  )}
                  <button
                    type="submit"
                    formAction={deleteAthlete.bind(null, athlete.id)}
                    className="px-2 text-[13px] text-muted hover:text-ink"
                  >
                    Remove
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Events({ competition }: { competition: Competition }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Heading
          title="Events"
          blurb="The workouts, in the order they will be run."
        />
        <Link
          href={`/competitions/${competition.id}/events?from=setup`}
          className="flex h-11 items-center rounded-lg border border-line bg-card px-[18px] font-semibold"
        >
          Open event builder
        </Link>
      </div>

      {/*
        Each event opens in the event builder, where the workout is written out
        movement by movement. That is what the bar loading, the equipment for
        each heat and counting a capped athlete's reps all work from.
      */}
      <div className="flex flex-col rounded-xl border border-line bg-card">
        {competition.events.length === 0 && (
          <p className="p-5 text-[15px] text-muted">No events yet.</p>
        )}
        {competition.events.map((event, index) => {
          const movements = event._count.movements;
          return (
            <Link
              key={event.id}
              href={`/competitions/${competition.id}/events?event=${event.id}&from=setup`}
              className="flex items-center gap-3 border-b border-[#EFEADF] px-5 py-3 last:border-0 hover:bg-paper"
            >
              <span className="font-display num w-7 text-[18px] font-bold text-muted">
                {index + 1}
              </span>
              <span className="flex flex-1 flex-col">
                <span className="text-[16px] font-semibold">{event.name}</span>
                <span className="text-[13px] text-muted">
                  {event.blocks.map((block) => FORMATS[block.format].label).join(" + ")}
                  {event.timeCapSeconds ? ` · cap ${formatTime(event.timeCapSeconds)}` : ""}
                  {" · "}
                  {movements === 0 ? (
                    <span className="font-semibold text-[#8A4B12]">No workout yet</span>
                  ) : (
                    `${movements} ${movements === 1 ? "movement" : "movements"}`
                  )}
                </span>
              </span>
              <span className="text-[14px] font-semibold">
                {movements === 0 ? "Add the workout" : "Edit"} →
              </span>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2">
        <Field label="Workout name">
          <input name="name" placeholder="Event 1 — The Chipper" className={inputClass} />
        </Field>
        <Field label="Time cap in minutes (optional)">
          <input name="timeCapMinutes" type="number" min={1} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="flex h-11 items-center rounded-lg border border-line bg-card px-4 font-semibold"
          >
            Add event
          </button>
        </div>
      </div>

      <p className="text-[14px] text-muted">
        Adding an event opens it in the event builder, to write out its movements, reps and
        loads. Those are what the bar loading, the equipment for each heat and a capped
        athlete&apos;s reps are worked out from.
      </p>
    </div>
  );
}

function Sharing({ competition }: { competition: Competition }) {
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <Heading title="Screens & sharing" blurb="Who can see the results, and where." />

      <Toggle
        name="athleteAccess"
        checked={competition.athleteAccess}
        title="Let athletes see their own results"
        desc="They scan a QR code and see only their own scores and placings."
      />
      <Toggle
        name="publicLink"
        checked={competition.publicLink}
        title="Public leaderboard link"
        desc="Anyone with the link can watch the leaderboard. They cannot change anything."
      />

      <div className="rounded-xl border border-line bg-card p-4">
        <p className="text-[15px] font-semibold">Big screens</p>
        <p className="mt-1 text-[14px] text-muted">
          The TV leaderboard is ready and can be opened from the competition page. Deciding
          which screen shows what comes with the heats work.
        </p>
      </div>
    </div>
  );
}

function Toggle({
  name,
  checked,
  title,
  desc,
}: {
  name: string;
  checked: boolean;
  title: string;
  desc: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-4">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 h-5 w-5" />
      <span className="flex flex-col gap-0.5">
        <span className="text-[16px] font-semibold">{title}</span>
        <span className="text-[14px] text-muted">{desc}</span>
      </span>
    </label>
  );
}

function tieLabel(rule: "SHARE_HIGHER" | "TIEBREAK_TIME" | "SHARE_AVERAGE"): string {
  switch (rule) {
    case "SHARE_HIGHER":
      return "Share the higher place";
    case "TIEBREAK_TIME":
      return "Split by tiebreak time";
    case "SHARE_AVERAGE":
      return "Share the average";
  }
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}
