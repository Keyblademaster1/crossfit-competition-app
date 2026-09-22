"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The clock on the workout screen.
 *
 * A heat starts when a judge counts down and says go, not at the time written
 * on the running order, so the clock is driven by hand: click it, or press
 * space, to start and stop. R puts it back to zero. The screen is usually
 * driven from the scorekeeper's laptop, which is why the keys are there.
 *
 * Where there is a time cap the clock stops dead on it, because nothing
 * counts after the cap — a team still on the floor is scored on reps.
 *
 * Nothing here is saved. A refresh puts the clock back to zero, which is the
 * honest behaviour: the app has no idea whether a heat is running.
 */
export function HeatClock({
  timeCapSeconds,
  /** One 1920th of the screen width, so the clock scales with the screen. */
  unit = "var(--u)",
}: {
  timeCapSeconds: number | null;
  unit?: string;
}) {
  const capMs = timeCapSeconds === null ? null : timeCapSeconds * 1000;

  // Time already run in earlier spells, plus the moment the current spell
  // began. Keeping the two apart means pausing never loses a fraction and the
  // clock cannot drift: it is always read off the wall clock, not counted up.
  const [banked, setBanked] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const run = startedAt === null ? 0 : Math.max(0, now - startedAt);
  const atCap = capMs !== null && banked + run >= capMs;
  const elapsed = capMs === null ? banked + run : Math.min(banked + run, capMs);

  // Ten times a second: fast enough that seconds turn over when they should,
  // slow enough to be nothing on a machine also serving the rest of the app.
  // Reaching the cap stops the clock here rather than letting it run past —
  // which also clears this interval, since it only exists while running.
  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => {
      const moment = Date.now();
      if (capMs !== null && banked + (moment - startedAt) >= capMs) {
        setBanked(capMs);
        setStartedAt(null);
      } else {
        setNow(moment);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [startedAt, banked, capMs]);

  const toggle = useCallback(() => {
    const moment = Date.now();
    if (startedAt === null) {
      if (atCap) return;
      setNow(moment);
      setStartedAt(moment);
    } else {
      setBanked(banked + moment - startedAt);
      setStartedAt(null);
    }
  }, [startedAt, banked, atCap]);

  const reset = useCallback(() => {
    setStartedAt(null);
    setBanked(0);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // A focused button already handles space itself; handling it again here
      // would start and stop the clock in the same keystroke.
      const target = event.target as HTMLElement | null;
      if (target && target.closest("button")) return;

      if (event.key === " ") {
        event.preventDefault();
        toggle();
      } else if (event.key === "r" || event.key === "R") {
        reset();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, reset]);

  const running = startedAt !== null;
  const size = (n: number) => `calc(${n} * ${unit})`;

  return (
    <div className="flex items-center" style={{ gap: size(12) }}>
      {!running && banked > 0 && (
        <button
          type="button"
          onClick={reset}
          className="font-semibold"
          style={{
            height: size(44),
            padding: `0 ${size(18)}`,
            borderRadius: size(10),
            fontSize: size(17),
            background: "rgba(255,255,255,.12)",
            color: "#fff",
          }}
        >
          Reset
        </button>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-label={running ? "Stop the clock" : "Start the clock"}
        className="flex flex-col items-end"
        style={{
          padding: `${size(10)} ${size(22)}`,
          borderRadius: size(14),
          // The cap is the one thing on this screen worth shouting about, so
          // reaching it changes the colour of the clock rather than adding
          // another thing to read.
          background: atCap ? "#8A2A12" : "var(--brand-primary)",
          color: "#fff",
        }}
      >
        <span
          className="font-display num font-bold leading-none"
          style={{ fontSize: size(72) }}
        >
          {clockFace(elapsed)}
        </span>
        <span className="font-semibold" style={{ fontSize: size(18), opacity: 0.9 }}>
          {caption({ running, atCap, started: banked > 0, timeCapSeconds })}
        </span>
      </button>
    </div>
  );
}

/** mm:ss, with the minutes padded so the clock does not jump a digit wider. */
function clockFace(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/** The line under the clock: the cap, and what the clock is doing. */
function caption({
  running,
  atCap,
  started,
  timeCapSeconds,
}: {
  running: boolean;
  atCap: boolean;
  started: boolean;
  timeCapSeconds: number | null;
}): string {
  const cap =
    timeCapSeconds === null
      ? "No time cap"
      : `Time cap ${Math.floor(timeCapSeconds / 60)}:${String(timeCapSeconds % 60).padStart(2, "0")}`;

  if (atCap) return `${cap} — reached`;
  if (running) return cap;
  if (started) return `Paused · ${cap}`;
  return `${cap} · space to start`;
}
