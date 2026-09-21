"use client";

import { useState } from "react";
import type { ScoreType } from "@/lib/score-format";

/**
 * The boxes a scorekeeper types a result into.
 *
 * This is the one piece of the score entry screen that runs in the browser,
 * because the boxes have to change the instant "Capped" is chosen. Waiting for
 * the server would mean pressing Save with no reps box on screen, which would
 * clear the result instead of recording it.
 */

export interface ScoreFieldsProps {
  scoreType: ScoreType;
  repsPerRound: number | null;
  /** Existing values, already split into the parts shown on screen. */
  initial: {
    didNotFinish: boolean;
    minutes: string;
    seconds: string;
    rounds: string;
    reps: string;
    plain: string;
  };
}

export function ScoreFields({ scoreType, repsPerRound, initial }: ScoreFieldsProps) {
  const [capped, setCapped] = useState(initial.didNotFinish);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
      <div className="flex shrink-0 overflow-hidden rounded-lg border border-[#CEC8BA]">
        <Status label="Finished" checked={!capped} onPick={() => setCapped(false)} value="FINISHED" />
        <Status label="Capped" checked={capped} onPick={() => setCapped(true)} value="CAPPED" />
      </div>

      {capped ? (
        <div className="flex shrink-0 items-center gap-2">
          <Box name="reps" defaultValue={initial.reps} width={70} label="Reps completed" />
          <span className="whitespace-nowrap text-[14px] text-muted">reps</span>
        </div>
      ) : scoreType === "TIME" ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Box name="minutes" defaultValue={initial.minutes} width={64} label="Minutes" />
          <span className="font-display text-[24px] font-bold">:</span>
          <Box name="seconds" defaultValue={initial.seconds} width={64} label="Seconds" />
        </div>
      ) : scoreType === "ROUNDS_REPS" ? (
        <div className="flex shrink-0 items-center gap-2">
          <Box name="rounds" defaultValue={initial.rounds} width={70} label="Rounds" />
          <span className="font-display text-[24px] font-bold">+</span>
          <Box name="reps" defaultValue={initial.reps} width={70} label="Reps" />
          {repsPerRound ? (
            <span className="whitespace-nowrap text-[14px] text-muted">
              {repsPerRound} per round
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <Box
            name="value"
            defaultValue={initial.plain}
            width={90}
            label={scoreType === "WEIGHT" ? "Kilograms" : "Reps"}
          />
          <span className="text-[14px] text-muted">{scoreType === "WEIGHT" ? "kg" : "reps"}</span>
        </div>
      )}
    </div>
  );
}

function Status({
  label,
  value,
  checked,
  onPick,
}: {
  label: string;
  value: string;
  checked: boolean;
  onPick: () => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center px-3 text-[14px] font-semibold"
      style={{
        height: 46,
        background: checked ? "var(--ink)" : "var(--card)",
        color: checked ? "#fff" : "var(--ink)",
      }}
    >
      <input
        type="radio"
        name="status"
        value={value}
        checked={checked}
        onChange={onPick}
        className="sr-only"
      />
      {label}
    </label>
  );
}

function Box({
  name,
  defaultValue,
  width,
  label,
}: {
  name: string;
  defaultValue: string;
  width: number;
  label: string;
}) {
  return (
    <input
      name={name}
      aria-label={label}
      defaultValue={defaultValue}
      inputMode="numeric"
      style={{ width }}
      className="font-display num h-12 rounded-lg border border-[#CEC8BA] bg-card text-center text-[24px] font-bold outline-none focus:border-ink"
    />
  );
}
